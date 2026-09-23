import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
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

import { ReservationStatus } from '../../common/enums/reservation.enums';
import { MovementType } from '../../common/enums/inventory.enums';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation) private reservationRepository: Repository<Reservation>,
    @InjectRepository(ReservationItem) private reservationItemRepository: Repository<ReservationItem>,
    @InjectRepository(Client) private clientRepository: Repository<Client>,
    @InjectRepository(Inventory) private inventoryRepository: Repository<Inventory>,
    private dataSource: DataSource,
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
      return savedReservation;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(user: any) {
    const isAdmin = user.roles?.includes('ADMIN');
    const isEncargado = user.roles?.includes('ENCARGADO');
    
    let whereClause: any = {};

    if (isAdmin) {
      // Todo
    } else if (isEncargado) {
      whereClause.branchId = user.branchId;
    } else {
      // Cliente
      const client = await this.getClientByUser(user);
      whereClause.clientId = client.id;
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
        }
      },
      order: { id: 'DESC' }
    });
  }

  async findOne(id: number, user: any) {
    const isAdmin = user.roles?.includes('ADMIN');
    const isEncargado = user.roles?.includes('ENCARGADO');
    
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

    if (!isAdmin) {
      if (isEncargado && reservation.branchId !== user.branchId) {
        throw new UnauthorizedException('No tiene permisos para ver reservas de otras sucursales');
      } else if (!isEncargado) {
        const client = await this.getClientByUser(user);
        if (reservation.clientId !== client.id) {
          throw new UnauthorizedException('Solo puedes ver tus propias reservas');
        }
      }
    }

    return reservation;
  }

  async update(id: number, updateReservationDto: UpdateReservationDto, user: any) {
    const reservation = await this.findOne(id, user); // checks authorization

    const isAdmin = user.roles?.includes('ADMIN');
    const isEncargado = user.roles?.includes('ENCARGADO');
    const isClient = !isAdmin && !isEncargado;

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
    return this.reservationRepository.save(reservation);
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
}
