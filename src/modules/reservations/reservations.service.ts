import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { CreateReservationDto, UpdateReservationDto } from './reservation.dto';
import { Reservation } from './reservation.entity';
import { ReservationItem } from './reservation-item.entity';
import { Client } from '../clients/client.entity';
import { Inventory } from '../inventory/inventory.entity';
import { InventoryMovement } from '../inventory/inventory-movement.entity';
import { Branch } from '../branches/branch.entity';
import { Variant } from '../catalog/variant.entity';
import { NotificationsService } from '../notifications/notifications.service';

import { ReservationStatus } from './reservation.enums';
import { MovementType } from '../inventory/inventory.enums';
import { Sale } from '../sales/sale.entity';
import { SaleItem } from '../sales/sale-item.entity';
import { Payment } from '../sales/payment.entity';
import { SaleChannel, SaleStatus, PaymentMethod, PaymentStatus } from '../sales/sales.enums';
import { AppGateway } from '../../common/realtime/app.gateway';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation) private reservationRepository: Repository<Reservation>,
    @InjectRepository(ReservationItem) private reservationItemRepository: Repository<ReservationItem>,
    @InjectRepository(Client) private clientRepository: Repository<Client>,
    @InjectRepository(Inventory) private inventoryRepository: Repository<Inventory>,
    private dataSource: DataSource,
    private notificationsService: NotificationsService,
    private readonly appGateway: AppGateway,
  ) {}

  private async getClientByUser(user: any): Promise<Client> {
    const client = await this.clientRepository.findOneBy({ userId: user.sub });
    if (!client) {
      throw new UnauthorizedException('El usuario no tiene un perfil de cliente asociado.');
    }
    return client;
  }

  async create(createReservationDto: CreateReservationDto, user: any) {
    const client = await this.getClientByUser(user);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validar branch
      const branch = await queryRunner.manager.findOne(Branch, { where: { id: createReservationDto.branchId, active: true } });
      if (!branch) throw new NotFoundException(`La sucursal ${createReservationDto.branchId} no existe o no est activa`);

      // Crear Entidad Reserva
      const reservation = queryRunner.manager.create(Reservation, {
        status: ReservationStatus.PENDIENTE,
        date: createReservationDto.date,
        approximateTime: createReservationDto.approximateTime,
        clientId: client.id,
        branchId: createReservationDto.branchId,
      });
      const savedReservation = await queryRunner.manager.save(reservation);

      for (const itemDto of createReservationDto.items) {
        // Validar variante
        const variant = await queryRunner.manager.findOne(Variant, { where: { id: itemDto.variantId, active: true }, relations: { product: true } });
        if (!variant || !variant.product.active) {
          throw new NotFoundException(`La variante ${itemDto.variantId} no est disponible`);
        }

        // Buscar y bloquear inventario
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { branchId: createReservationDto.branchId, variantId: itemDto.variantId },
          lock: { mode: 'pessimistic_write' }
        });

        if (!inventory) throw new BadRequestException(`No hay inventario para la variante ${itemDto.variantId} en esta sucursal`);

        const available = inventory.stock - inventory.reserved;
        if (available < itemDto.quantity) {
          throw new BadRequestException(`Stock insuficiente para la variante ${itemDto.variantId}. Disponible: ${available}`);
        }

        // Actualizar Inventario
        inventory.reserved += itemDto.quantity;
        await queryRunner.manager.save(inventory);

        // Crear Item
        const item = queryRunner.manager.create(ReservationItem, {
          quantity: itemDto.quantity,
          reservationId: savedReservation.id,
          variantId: itemDto.variantId,
        });
        await queryRunner.manager.save(item);

        // Registrar Movimiento
        const movement = queryRunner.manager.create(InventoryMovement, {
          inventoryId: inventory.id,
          type: MovementType.RESERVA,
          quantity: itemDto.quantity,
          userId: user.sub,
          notes: `Reserva #${savedReservation.id}`
        });
        await queryRunner.manager.save(movement);
      }

      await queryRunner.commitTransaction();

      // Disparar notificaciones despues del commit de forma asincrona y segura
      const clientName = `${client.name} ${client.lastName}`;
      this.notificationsService.notifyReservationCreated(
        createReservationDto.branchId,
        savedReservation,
        clientName
      ).catch(e => console.error('Failed to notify reservation', e));

      return savedReservation;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findMyReservations(user: any) {
    if (!user.roles?.includes('CLIENTE')) {
      throw new ForbiddenException('Endpoint exclusivo para clientes');
    }
    const client = await this.getClientByUser(user);

    return this.reservationRepository.find({
      where: { clientId: client.id },
      relations: {
        branch: true,
        client: true,
        items: {
          variant: {
            product: true,
            size: true,
            color: true
          }
        }
      },
      order: { id: 'DESC' }
    });
  }

  async findOneMyReservation(id: number, user: any) {
    if (!user.roles?.includes('CLIENTE')) {
      throw new ForbiddenException('Endpoint exclusivo para clientes');
    }
    const client = await this.getClientByUser(user);

    const reservation = await this.reservationRepository.findOne({
      where: { id, clientId: client.id },
      relations: {
        branch: true,
        client: true,
        items: {
          variant: {
            product: true,
            size: true,
            color: true
          }
        }
      }
    });

    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    return reservation;
  }

  async findAll(user: any) {
    const isAdmin = user.roles?.includes('ADMIN');
    const isEncargado = user.roles?.includes('ENCARGADO');
    const isCajero = user.roles?.includes('CAJERO');
    
    if (!isAdmin && !isEncargado && !isCajero) {
      throw new ForbiddenException('No tiene permisos internos para listar reservas');
    }

    let whereClause: any = {};

    if (isEncargado || isCajero) {
      whereClause.branchId = user.branchId;
    }

    return this.reservationRepository.find({
      where: whereClause,
      relations: {
        branch: true,
        client: true,
        items: {
          variant: {
            product: true,
            size: true,
            color: true
          }
        },
        sale: {
          payments: true
        }
      },
      order: { id: 'DESC' }
    });
  }

  async findOne(id: number, user: any) {
    const isAdmin = user.roles?.includes('ADMIN');
    const isEncargado = user.roles?.includes('ENCARGADO');
    const isCajero = user.roles?.includes('CAJERO');
    
    if (!isAdmin && !isEncargado && !isCajero) {
      throw new ForbiddenException('No tiene permisos internos para ver esta reserva');
    }

    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: {
        branch: true,
        client: true,
        items: {
          variant: {
            product: true,
            size: true,
            color: true
          }
        }
      }
    });

    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    if (!isAdmin && (isEncargado || isCajero) && reservation.branchId !== user.branchId) {
      throw new UnauthorizedException('No tiene permisos para ver reservas de otras sucursales');
    }

    return reservation;
  }

  async update(id: number, updateReservationDto: UpdateReservationDto, user: any) {
    const reservation = await this.findOne(id, user); // checks authorization

    const isAdmin = user.roles?.includes('ADMIN');
    const isEncargado = user.roles?.includes('ENCARGADO');
    const isCajero = user.roles?.includes('CAJERO');
    
    if (isCajero) {
      throw new UnauthorizedException('Cajeros no pueden modificar estados de reservas');
    }

    const isClient = !isAdmin && !isEncargado && !isCajero;

    // Solo un cliente o administrador/encargado puede cancelar
    if (updateReservationDto.status === ReservationStatus.CANCELADA) {
      if (reservation.status === ReservationStatus.CANCELADA || reservation.status === ReservationStatus.ATENDIDA) {
        throw new BadRequestException('No se puede cancelar en este estado');
      }
      return this.cancelReservation(id, user);
    }

    // Cambios de estado positivos
    if (isClient) {
      throw new UnauthorizedException('Clientes no pueden avanzar estados de reservas');
    }

    const flow = [
      ReservationStatus.PENDIENTE,
      ReservationStatus.CONFIRMADA,
      ReservationStatus.PREPARANDO,
      ReservationStatus.LISTA,
      ReservationStatus.ATENDIDA
    ];

    const currentIndex = flow.indexOf(reservation.status);
    const targetIndex = flow.indexOf(updateReservationDto.status);

    if (targetIndex === -1 || currentIndex === -1) {
      throw new BadRequestException('Estado invlido');
    }

    // Permitir avanzar pero NO retroceder arbitrariamente
    if (targetIndex <= currentIndex) {
      throw new BadRequestException('Solo puede avanzar el estado');
    }

    // Si es ATENDIDA, liberar inventario sin deducir stock (hasta las ventas)
    if (updateReservationDto.status === ReservationStatus.ATENDIDA) {
      await this.markAsAttended(reservation, user);
    }

    reservation.status = updateReservationDto.status;
    const saved = await this.reservationRepository.save(reservation);

    this.notificationsService.notifyReservationStatusUpdated(
      saved.branchId,
      saved,
      saved.client.userId,
      updateReservationDto.status
    ).catch(e => console.error('Error notifying status update', e));

    return saved;
  }

  private async cancelReservation(id: number, user: any) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id },
        relations: { items: true }
      });
      if (!reservation) throw new NotFoundException();

      for (const item of reservation.items) {
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { branchId: reservation.branchId, variantId: item.variantId },
          lock: { mode: 'pessimistic_write' }
        });

        if (inventory) {
          inventory.reserved = Math.max(0, inventory.reserved - item.quantity);
          await queryRunner.manager.save(inventory);

          const movement = queryRunner.manager.create(InventoryMovement, {
            inventoryId: inventory.id,
            type: MovementType.LIBERACION_RESERVA,
            quantity: item.quantity,
            userId: user.sub,
            notes: `Cancelacin Reserva #${reservation.id}`
          });
          await queryRunner.manager.save(movement);
        }
      }

      reservation.status = ReservationStatus.CANCELADA;
      const saved = await queryRunner.manager.save(reservation);

      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private async markAsAttended(reservation: Reservation, user: any) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get fresh reservation items in transaction
      const freshRes = await queryRunner.manager.findOne(Reservation, {
        where: { id: reservation.id },
        relations: { items: true }
      });
      if (!freshRes) throw new NotFoundException();

      for (const item of freshRes.items) {
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { branchId: freshRes.branchId, variantId: item.variantId },
          lock: { mode: 'pessimistic_write' }
        });

        if (inventory) {
          inventory.reserved = Math.max(0, inventory.reserved - item.quantity);
          // OJO: No se reduce el stock aqu, solo se libera reserved. La VENTA har la reduccin del stock.
          await queryRunner.manager.save(inventory);

          const movement = queryRunner.manager.create(InventoryMovement, {
            inventoryId: inventory.id,
            type: MovementType.LIBERACION_RESERVA,
            quantity: item.quantity,
            userId: user.sub,
            notes: `Atencin Reserva #${freshRes.id}`
          });
          await queryRunner.manager.save(movement);
        }
      }
      
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: number) {
    throw new BadRequestException('No se puede eliminar fsicamente una reserva. Use status = CANCELADA');
  }

  async pay(id: number, paymentOption: 'DEPOSIT_30' | 'FULL', user: any) {
    if (!user.roles?.includes('CLIENTE')) {
      throw new ForbiddenException('Endpoint exclusivo para clientes');
    }
    const client = await this.getClientByUser(user);

    if (paymentOption !== 'DEPOSIT_30' && paymentOption !== 'FULL') {
      throw new BadRequestException('Opción de pago inválida');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id, clientId: client.id },
        lock: { mode: 'pessimistic_write' },
        relations: { items: { variant: { product: true } } }
      });

      if (!reservation) {
        throw new NotFoundException('Reserva no encontrada');
      }

      if (reservation.status !== ReservationStatus.PENDIENTE) {
        throw new BadRequestException('La reserva debe estar en estado PENDIENTE para ser pagada');
      }

      const existingSale = await queryRunner.manager.findOne(Sale, {
        where: { reservationId: id }
      });
      if (existingSale) {
        throw new ConflictException('La reserva ya ha sido pagada o tiene una venta asociada');
      }

      let total = 0;
      const saleItemsToSave = [];
      const inventoriesToUpdate = [];
      const inventoryMovementsToSave = [];

      for (const item of reservation.items) {
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { branchId: reservation.branchId, variantId: item.variantId },
          lock: { mode: 'pessimistic_write' }
        });

        if (!inventory) {
          throw new NotFoundException(`Inventario no encontrado para la variante ${item.variantId}`);
        }

        if (!item.variant.active || !item.variant.product.active) {
          throw new BadRequestException(`El producto o variante ${item.variantId} está inactivo`);
        }

        if (inventory.stock < item.quantity) {
          throw new ConflictException(`Stock insuficiente para la variante ${item.variantId}`);
        }

        if (inventory.reserved < item.quantity) {
          throw new ConflictException(`Cantidad reservada inconsistente para la variante ${item.variantId}`);
        }

        const unitPriceNum = Number(item.variant.product.price);
        const subtotalNum = Number((unitPriceNum * item.quantity).toFixed(2));
        total += subtotalNum;

        const saleItem = queryRunner.manager.create(SaleItem, {
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: unitPriceNum,
          subtotal: subtotalNum,
          saleId: 0
        });
        saleItemsToSave.push(saleItem);

        if (paymentOption === 'FULL') {
          inventory.stock -= item.quantity;
          inventory.reserved -= item.quantity;
          inventoriesToUpdate.push(inventory);

          const movement = queryRunner.manager.create(InventoryMovement, {
            inventoryId: inventory.id,
            type: MovementType.VENTA,
            quantity: item.quantity,
            userId: user.sub,
            notes: `Venta por reserva #${reservation.id}`
          });
          inventoryMovementsToSave.push(movement);
        }
      }

      total = Number(total.toFixed(2));
      const amountToPay = paymentOption === 'DEPOSIT_30' ? Number((total * 0.3).toFixed(2)) : total;

      const sale = queryRunner.manager.create(Sale, {
        channel: SaleChannel.WEB,
        status: paymentOption === 'FULL' ? SaleStatus.COMPLETADA : SaleStatus.PENDIENTE,
        branchId: reservation.branchId,
        clientId: client.id,
        reservationId: reservation.id,
        subtotal: total,
        total: total,
        userId: user.sub,
      });

      const savedSale = await queryRunner.manager.save(Sale, sale);

      for (const si of saleItemsToSave) {
        si.saleId = savedSale.id;
        await queryRunner.manager.save(SaleItem, si);
      }

      const payment = queryRunner.manager.create(Payment, {
        saleId: savedSale.id,
        amount: amountToPay,
        method: PaymentMethod.PASARELA,
        status: PaymentStatus.APROBADO
      });
      await queryRunner.manager.save(Payment, payment);

      for (const inv of inventoriesToUpdate) {
        await queryRunner.manager.save(Inventory, inv);
      }

      for (const mov of inventoryMovementsToSave) {
        await queryRunner.manager.save(InventoryMovement, mov);
      }

      reservation.status = ReservationStatus.CONFIRMADA;
      await queryRunner.manager.save(Reservation, reservation);

      await queryRunner.commitTransaction();

      // Notifications logic
      const clientName = `${client.name} ${client.lastName}`;
      this.notificationsService.notifyReservationPaid(
        reservation.branchId,
        reservation,
        clientName,
        client.userId
      ).catch(e => console.error('Failed to notify reservation paid', e));

      return { success: true, message: 'Pago exitoso', reservation };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async deliver(id: number, user: any) {
    if (!user.roles?.includes('CAJERO')) {
      throw new ForbiddenException('Endpoint exclusivo para cajeros');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id, branchId: user.branchId },
        relations: { sale: { payments: true }, client: true }
      });

      if (!reservation) {
        throw new NotFoundException('Reserva no encontrada o no pertenece a su sucursal');
      }

      if (reservation.status === ReservationStatus.ATENDIDA) {
        throw new ConflictException('La reserva ya ha sido entregada');
      }

      if (reservation.status !== ReservationStatus.LISTA) {
        throw new BadRequestException('La reserva debe estar en estado LISTA para ser entregada');
      }

      if (!reservation.sale) {
        throw new BadRequestException('La reserva no tiene una venta asociada');
      }

      const hasApprovedPayment = reservation.sale.payments?.some(p => p.status === PaymentStatus.APROBADO);
      if (!hasApprovedPayment) {
        throw new BadRequestException('La venta no tiene un pago aprobado');
      }

      reservation.status = ReservationStatus.ATENDIDA;
      await queryRunner.manager.save(Reservation, reservation);

      await queryRunner.commitTransaction();

      // Cajero info
      const cashierName = user.name ? `${user.name} ${user.lastName || ''}`.trim() : 'Cajero';

      // Notifications
      this.notificationsService.notifyReservationDelivered(
        reservation.branchId,
        reservation,
        cashierName,
        reservation.client.userId
      ).catch(e => console.error('Failed to notify reservation delivered', e));

      // WS Event
      this.appGateway.notifyReservationAttended({
        reservationId: reservation.id,
        branchId: reservation.branchId,
        status: "ATENDIDA",
        cashierName
      });

      return { success: true, message: 'Reserva entregada con éxito', reservation };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async payAndDeliver(id: number, method: string, user: any) {
    if (!user.roles?.includes('CAJERO')) {
      throw new ForbiddenException('Endpoint exclusivo para cajeros');
    }

    if (!Object.values(PaymentMethod).includes(method as PaymentMethod) || method === PaymentMethod.PASARELA) {
      throw new BadRequestException('Método de pago inválido o no soportado en caja');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id, branchId: user.branchId },
        lock: { mode: 'pessimistic_write' },
        relations: { items: { variant: { product: true } }, client: true, sale: { payments: true } }
      });

      if (!reservation) {
        throw new NotFoundException('Reserva no encontrada o no pertenece a su sucursal');
      }

      if (reservation.status === ReservationStatus.ATENDIDA) {
        throw new ConflictException('La reserva ya ha sido entregada');
      }

      if (reservation.status !== ReservationStatus.LISTA) {
        throw new BadRequestException('La reserva debe estar en estado LISTA para ser cobrada y entregada');
      }

      let remainingAmount = 0;
      let existingSale = reservation.sale;

      if (existingSale) {
        const paidAmount = existingSale.payments?.filter(p => p.status === PaymentStatus.APROBADO).reduce((sum, p) => sum + Number(p.amount), 0) || 0;
        remainingAmount = Number((Number(existingSale.total) - paidAmount).toFixed(2));
        
        if (remainingAmount <= 0 || existingSale.status === SaleStatus.COMPLETADA) {
          throw new ConflictException('La reserva ya está totalmente pagada, use el botón de Validar Entrega');
        }
      }

      let total = 0;
      const saleItemsToSave = [];
      const inventoriesToUpdate = [];
      const inventoryMovementsToSave = [];

      for (const item of reservation.items) {
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { branchId: reservation.branchId, variantId: item.variantId },
          lock: { mode: 'pessimistic_write' }
        });

        if (!inventory) {
          throw new NotFoundException(`Inventario no encontrado para la variante ${item.variantId}`);
        }

        if (inventory.stock < item.quantity) {
          throw new ConflictException(`Stock insuficiente para la variante ${item.variantId}`);
        }

        if (inventory.reserved < item.quantity) {
          throw new ConflictException(`Cantidad reservada inconsistente para la variante ${item.variantId}`);
        }

        const unitPriceNum = Number(item.variant.product.price);
        const subtotalNum = Number((unitPriceNum * item.quantity).toFixed(2));
        total += subtotalNum;

        if (!existingSale) {
          const saleItem = queryRunner.manager.create(SaleItem, {
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: unitPriceNum,
            subtotal: subtotalNum,
            saleId: 0
          });
          saleItemsToSave.push(saleItem);
        }

        inventory.stock -= item.quantity;
        inventory.reserved -= item.quantity;
        inventoriesToUpdate.push(inventory);

        const movement = queryRunner.manager.create(InventoryMovement, {
          inventoryId: inventory.id,
          type: MovementType.VENTA,
          quantity: item.quantity,
          userId: user.sub,
          notes: `Venta por reserva #${reservation.id} en caja`
        });
        inventoryMovementsToSave.push(movement);
      }

      total = Number(total.toFixed(2));

      if (!existingSale) {
        remainingAmount = total;
        existingSale = queryRunner.manager.create(Sale, {
          channel: SaleChannel.POS,
          status: SaleStatus.COMPLETADA,
          branchId: reservation.branchId,
          clientId: reservation.client.id,
          reservationId: reservation.id,
          subtotal: total,
          total: total,
          userId: user.sub,
        });

        const savedSale = await queryRunner.manager.save(Sale, existingSale);
        existingSale.id = savedSale.id;

        for (const si of saleItemsToSave) {
          si.saleId = existingSale.id;
          await queryRunner.manager.save(SaleItem, si);
        }
      } else {
        existingSale.status = SaleStatus.COMPLETADA;
        await queryRunner.manager.save(Sale, existingSale);
      }

      const payment = queryRunner.manager.create(Payment, {
        saleId: existingSale.id,
        amount: remainingAmount,
        method: method as PaymentMethod,
        status: PaymentStatus.APROBADO
      });
      await queryRunner.manager.save(Payment, payment);

      for (const inv of inventoriesToUpdate) {
        await queryRunner.manager.save(Inventory, inv);
      }

      for (const mov of inventoryMovementsToSave) {
        await queryRunner.manager.save(InventoryMovement, mov);
      }

      reservation.status = ReservationStatus.ATENDIDA;
      await queryRunner.manager.save(Reservation, reservation);

      await queryRunner.commitTransaction();

      // Cajero info
      const cashierName = user.name ? `${user.name} ${user.lastName || ''}`.trim() : 'Cajero';

      // Notifications
      this.notificationsService.notifyReservationDelivered(
        reservation.branchId,
        reservation,
        cashierName,
        reservation.client.userId
      ).catch(e => console.error('Failed to notify reservation delivered', e));

      // WS Event
      this.appGateway.notifyReservationAttended({
        reservationId: reservation.id,
        branchId: reservation.branchId,
        status: "ATENDIDA",
        cashierName
      });

      return { success: true, message: 'Reserva cobrada y entregada con éxito', reservation };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
