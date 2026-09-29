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
import { PaymentGatewayService } from '../sales/payment-gateway.service';
import { CatalogPricingService } from '../catalog/catalog-pricing.service';

export interface PaymentSummary {
  total: number;
  paidAmount: number;
  remainingAmount: number;
  depositAmount: number;
  paymentState: 'PENDIENTE' | 'PARCIAL' | 'PAGADO';
}

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
    private readonly paymentGatewayService: PaymentGatewayService,
    private readonly catalogPricingService: CatalogPricingService,
  ) {}

  private async getClientByUser(user: any): Promise<Client> {
    const client = await this.clientRepository.findOneBy({ userId: user.sub });
    if (!client) {
      throw new UnauthorizedException('El usuario no tiene un perfil de cliente asociado.');
    }
    return client;
  }

  private calculatePaymentSummary(reservation: Reservation): PaymentSummary {
    let total = 0;
    if (reservation.sale && reservation.sale.total) {
      total = Number(reservation.sale.total);
    } else if (reservation.items) {
      total = reservation.items.reduce((sum, item) => {
        const price = item.variant?.product?.price || 0;
        return sum + (Number(price) * item.quantity);
      }, 0);
    }
    total = Number(total.toFixed(2));
    
    let paidAmount = 0;
    if (reservation.sale && reservation.sale.payments) {
      paidAmount = reservation.sale.payments
        .filter(p => p.status === PaymentStatus.APROBADO)
        .reduce((sum, p) => sum + Number(p.amount), 0);
    }
    paidAmount = Number(paidAmount.toFixed(2));
    
    const remainingAmount = Number((total - paidAmount).toFixed(2));
    const depositAmount = Number((total * 0.3).toFixed(2));
    
    let paymentState: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' = 'PENDIENTE';
    if (paidAmount >= total && total > 0) paymentState = 'PAGADO';
    else if (paidAmount > 0) paymentState = 'PARCIAL';

    return {
      total,
      paidAmount,
      remainingAmount,
      depositAmount,
      paymentState
    };
  }

  async create(createReservationDto: CreateReservationDto, user: any) {
    const client = await this.getClientByUser(user);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validar branch
      const branch = await queryRunner.manager.findOne(Branch, { where: { id: createReservationDto.branchId, active: true } });
      if (!branch) throw new NotFoundException(`La sucursal ${createReservationDto.branchId} no existe o no está activa`);

      // Crear Entidad Reserva (PENDIENTE esperando pago)
      const reservation = queryRunner.manager.create(Reservation, {
        status: ReservationStatus.PENDIENTE,
        date: createReservationDto.date,
        approximateTime: createReservationDto.approximateTime,
        clientId: client.id,
        branchId: createReservationDto.branchId,
      });
      const savedReservation = await queryRunner.manager.save(reservation);

      let total = 0;
      const reservationItemsToSave = [];
      const saleItemsToSave = [];
      const inventoriesToUpdate = [];
      const inventoryMovementsToSave = [];

      for (const itemDto of createReservationDto.items) {
        // Validar variante y producto
        const variant = await queryRunner.manager.findOne(Variant, { where: { id: itemDto.variantId, active: true }, relations: { product: true } });
        if (!variant || !variant.product.active) {
          throw new NotFoundException(`La variante ${itemDto.variantId} no está disponible`);
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

        const pricing = this.catalogPricingService.getEffectivePrice(variant.product);
        const unitPriceNum = Number(pricing.finalPrice);
        const subtotalNum = Number((unitPriceNum * itemDto.quantity).toFixed(2));
        total += subtotalNum;

        // Preparar ReservationItem
        const resItem = queryRunner.manager.create(ReservationItem, {
          quantity: itemDto.quantity,
          reservationId: savedReservation.id,
          variantId: itemDto.variantId,
        });
        reservationItemsToSave.push(resItem);

        // Preparar SaleItem
        const saleItem = queryRunner.manager.create(SaleItem, {
          variantId: itemDto.variantId,
          quantity: itemDto.quantity,
          unitPrice: unitPriceNum,
          subtotal: subtotalNum,
          saleId: 0 // Se actualiza despues de guardar Sale
        });
        saleItemsToSave.push(saleItem);

        // HOLD inventory independientemente de la opcion de pago
        inventory.reserved += itemDto.quantity;
        inventoriesToUpdate.push(inventory);
        
        const movement = queryRunner.manager.create(InventoryMovement, {
          inventoryId: inventory.id,
          type: MovementType.RESERVA,
          quantity: itemDto.quantity,
          userId: user.sub,
          notes: `Reserva #${savedReservation.id} (HOLD pasarela)`
        });
        inventoryMovementsToSave.push(movement);
      }

      total = Number(total.toFixed(2));

      // Crear Sale
      const sale = queryRunner.manager.create(Sale, {
        channel: SaleChannel.WEB,
        status: SaleStatus.PENDIENTE,
        branchId: createReservationDto.branchId,
        clientId: client.id,
        reservationId: savedReservation.id,
        subtotal: total,
        total: total,
        userId: user.sub,
      });
      const savedSale = await queryRunner.manager.save(Sale, sale);

      // Guardar ReservationItems y SaleItems
      for (const resItem of reservationItemsToSave) {
        await queryRunner.manager.save(ReservationItem, resItem);
      }
      for (const si of saleItemsToSave) {
        si.saleId = savedSale.id;
        await queryRunner.manager.save(SaleItem, si);
      }

      // Guardar Inventario
      for (const inv of inventoriesToUpdate) {
        await queryRunner.manager.save(Inventory, inv);
      }
      for (const mov of inventoryMovementsToSave) {
        await queryRunner.manager.save(InventoryMovement, mov);
      }

      await queryRunner.commitTransaction();

      return {
        reservationId: savedReservation.id,
        saleId: savedSale.id,
        total: total
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async createPayment(id: number, paymentOption: 'DEPOSIT_30' | 'FULL', clientPlatform: 'web' | 'mobile', user: any) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id, clientId: user.sub },
        relations: { sale: true },
        lock: { mode: 'pessimistic_write' }
      });

      if (!reservation) {
        throw new NotFoundException('Reserva no encontrada o no autorizada');
      }
      if (reservation.status !== ReservationStatus.PENDIENTE) {
        throw new BadRequestException('La reserva no esta en estado PENDIENTE');
      }
      if (!reservation.sale) {
        throw new BadRequestException('La reserva no tiene una venta asociada');
      }

      const total = Number(reservation.sale.total);
      const amountToPay = paymentOption === 'DEPOSIT_30' ? Number((total * 0.3).toFixed(2)) : total;

      const metadata = {
        reservationId: reservation.id.toString(),
        saleId: reservation.sale.id.toString(),
        paymentOption: paymentOption
      };

      let stripeResponse;
      if (clientPlatform === 'web') {
        stripeResponse = await this.paymentGatewayService.createCheckoutSession(amountToPay, metadata);
      } else {
        stripeResponse = await this.paymentGatewayService.createPaymentIntent(amountToPay, metadata);
      }

      const payment = queryRunner.manager.create(Payment, {
        saleId: reservation.sale.id,
        amount: amountToPay,
        method: PaymentMethod.PASARELA,
        status: PaymentStatus.PENDIENTE,
        transactionReference: stripeResponse.stripeId,
        stripePaymentIntentId: stripeResponse.stripeId
      });
      await queryRunner.manager.save(Payment, payment);

      await queryRunner.commitTransaction();

      return {
        paymentId: payment.id,
        ...stripeResponse
      };

    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async confirmStripePayment(paymentIntentId: string, status: 'SUCCESS' | 'FAIL', amount: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const payment = await queryRunner.manager.findOne(Payment, {
        where: { transactionReference: paymentIntentId },
        lock: { mode: 'pessimistic_write' },
        relations: { sale: { reservation: { items: true, client: true } } }
      });

      if (!payment) {
        throw new NotFoundException('Intento de pago no encontrado');
      }

      if (Number(payment.amount) !== amount) {
        throw new BadRequestException('El monto pagado no coincide con el registrado');
      }

      if (payment.status !== PaymentStatus.PENDIENTE) {
        // Idempotent: already processed
        await queryRunner.rollbackTransaction();
        return { message: 'Already processed' };
      }

      const sale = payment.sale;
      const reservation = sale.reservation;

      if (!sale || !reservation) {
        throw new BadRequestException('El pago no esta asociado a una venta/reserva valida');
      }

      // Adicional pessimistic locks opcionales (pero payment lock suele ser suficiente ya que no hay concurrencia por otra via)
      const lockedRes = await queryRunner.manager.findOne(Reservation, { where: { id: reservation.id }, lock: { mode: 'pessimistic_write' }});
      const lockedSale = await queryRunner.manager.findOne(Sale, { where: { id: sale.id }, lock: { mode: 'pessimistic_write' }});

      if (!lockedRes || !lockedSale) {
        await queryRunner.rollbackTransaction();
        return { message: 'Reservation or Sale not found' };
      }

      if (lockedRes.status !== ReservationStatus.PENDIENTE) {
         await queryRunner.rollbackTransaction();
         return { message: 'Reservation already processed' };
      }

      if (status === 'SUCCESS') {
        payment.status = PaymentStatus.APROBADO;
        reservation.status = ReservationStatus.CONFIRMADA;
        
        const isFull = Number(payment.amount) === Number(sale.total);
        if (isFull) {
          sale.status = SaleStatus.COMPLETADA;
          
          for (const item of reservation.items) {
             const inventory = await queryRunner.manager.findOne(Inventory, {
                where: { branchId: reservation.branchId, variantId: item.variantId },
                lock: { mode: 'pessimistic_write' }
             });
             
             // Convertir HOLD a VENTA
             if (inventory) {
               inventory.stock -= item.quantity;
               inventory.reserved -= item.quantity;
               await queryRunner.manager.save(inventory);
               
               const movement = queryRunner.manager.create(InventoryMovement, {
                  inventoryId: inventory.id,
                  type: MovementType.VENTA,
                  quantity: item.quantity,
                  userId: sale.userId,
                  notes: `Venta por reserva #${reservation.id} (pago completo confirmado)`
               });
               await queryRunner.manager.save(movement);
             }
          }
        } else {
           // DEPOSIT_30
           sale.status = SaleStatus.PENDIENTE;
           // reserved was already incremented, so do nothing to inventory!
        }
        
        await queryRunner.manager.save(payment);
        await queryRunner.manager.save(sale);
        await queryRunner.manager.save(reservation);
        
        await queryRunner.commitTransaction();

        const clientName = `${reservation.client.name} ${reservation.client.lastName}`;
        this.notificationsService.notifyReservationCreated(
          reservation.branchId,
          reservation,
          clientName
        ).catch(e => console.error(e));
        
        this.notificationsService.notifyReservationPaid(
          reservation.branchId,
          reservation,
          clientName,
          reservation.client.userId
        ).catch(e => console.error(e));
        
      } else {
        // FAIL
        payment.status = PaymentStatus.RECHAZADO;
        reservation.status = ReservationStatus.CANCELADA;
        sale.status = SaleStatus.PENDIENTE;
        
        for (const item of reservation.items) {
             const inventory = await queryRunner.manager.findOne(Inventory, {
                where: { branchId: reservation.branchId, variantId: item.variantId },
                lock: { mode: 'pessimistic_write' }
             });
             
             if (inventory) {
               inventory.reserved -= item.quantity;
               await queryRunner.manager.save(inventory);
               
               const movement = queryRunner.manager.create(InventoryMovement, {
                  inventoryId: inventory.id,
                  type: MovementType.LIBERACION_RESERVA,
                  quantity: item.quantity,
                  userId: sale.userId,
                  notes: `Pago fallido - Liberacion reserva #${reservation.id}`
               });
               await queryRunner.manager.save(movement);
             }
        }
        
        await queryRunner.manager.save(payment);
        await queryRunner.manager.save(sale);
        await queryRunner.manager.save(reservation);
        
        await queryRunner.commitTransaction();
      }
      return { success: true };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async cancelAbandonedIntents() {
    // 30 mins limit
    const expirationTime = new Date(Date.now() - 30 * 60 * 1000);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    
    // Solo lectura de pendientes antiguos
    const reservations = await queryRunner.manager.find(Reservation, {
      where: {
        status: ReservationStatus.PENDIENTE
      }
    });

    const abandoned = reservations.filter(r => new Date(r.registrationDate) < expirationTime);

    let cancelledCount = 0;
    for (const res of abandoned) {
       await queryRunner.startTransaction();
       try {
         const reservation = await queryRunner.manager.findOne(Reservation, {
           where: { id: res.id },
           lock: { mode: 'pessimistic_write' },
           relations: { items: true, sale: { payments: true } }
         });
         
         if (reservation && reservation.status === ReservationStatus.PENDIENTE) {
           reservation.status = ReservationStatus.CANCELADA;
           
           if (reservation.sale) {
             reservation.sale.status = SaleStatus.PENDIENTE; // o CANCELADA si existe el estado
             await queryRunner.manager.save(reservation.sale);
             
             if (reservation.sale.payments?.length) {
                for (const p of reservation.sale.payments) {
                  if (p.status === PaymentStatus.PENDIENTE) {
                    p.status = PaymentStatus.RECHAZADO;
                    await queryRunner.manager.save(p);
                  }
                }
             }
           }
           
           for (const item of reservation.items) {
             const inventory = await queryRunner.manager.findOne(Inventory, {
                where: { branchId: reservation.branchId, variantId: item.variantId },
                lock: { mode: 'pessimistic_write' }
             });
             if (inventory) {
               inventory.reserved -= item.quantity;
               await queryRunner.manager.save(inventory);
               
               const movement = queryRunner.manager.create(InventoryMovement, {
                  inventoryId: inventory.id,
                  type: MovementType.LIBERACION_RESERVA,
                  quantity: item.quantity,
                  userId: 1, // Admin o System user
                  notes: `Reserva expirada #${reservation.id} - Liberacion`
               });
               await queryRunner.manager.save(movement);
             }
           }
           await queryRunner.manager.save(reservation);
           await queryRunner.commitTransaction();
           cancelledCount++;
         } else {
           await queryRunner.rollbackTransaction();
         }
       } catch (err) {
         await queryRunner.rollbackTransaction();
       }
    }
    
    await queryRunner.release();
    return { cancelledCount };
  }

  async findMyReservations(user: any) {
    if (!user.roles?.includes('CLIENTE')) {
      throw new ForbiddenException('Endpoint exclusivo para clientes');
    }
    const client = await this.getClientByUser(user);

    const reservations = await this.reservationRepository.find({
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
        },
        sale: {
          payments: true
        }
      },
      order: { id: 'DESC' }
    });
    return reservations.map(r => ({ ...r, paymentSummary: this.calculatePaymentSummary(r) }));
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
        },
        sale: {
          payments: true
        }
      }
    });

    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    return { ...reservation, paymentSummary: this.calculatePaymentSummary(reservation) };
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

    const reservations = await this.reservationRepository.find({
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
    return reservations.map(r => ({ ...r, paymentSummary: this.calculatePaymentSummary(r) }));
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
        },
        sale: {
          payments: true
        }
      }
    });

    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    if (!isAdmin && (isEncargado || isCajero) && reservation.branchId !== user.branchId) {
      throw new UnauthorizedException('No tiene permisos para ver reservas de otras sucursales');
    }

    return { ...reservation, paymentSummary: this.calculatePaymentSummary(reservation) };
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

    if (updateReservationDto.status === ReservationStatus.LISTA) {
      this.appGateway.server.to(`branch:${saved.branchId}`).emit('reservation.ready', {
        reservationId: saved.id,
        message: 'Nueva reserva lista para entregar/cobrar'
      });
    }

    return saved;
  }

  async cancelMyReservation(id: number, user: any) {
    const reservation = await this.findOneMyReservation(id, user);
    if (reservation.status === ReservationStatus.CANCELADA || reservation.status === ReservationStatus.ATENDIDA) {
      throw new BadRequestException('No se puede cancelar en este estado');
    }
    return this.cancelReservation(id, user);
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
      let isPartialPayment = false;

      if (existingSale) {
        const summary = this.calculatePaymentSummary(reservation);
        
        if (summary.paymentState === 'PAGADO') {
          throw new ConflictException('La reserva ya está totalmente pagada, use el botón de Validar Entrega');
        }
        
        if (summary.paymentState === 'PARCIAL') {
          isPartialPayment = true;
          remainingAmount = summary.remainingAmount;
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
