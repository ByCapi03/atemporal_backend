import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { User } from '../auth/user.entity';
import { Branch } from '../branches/branch.entity';
import { Inventory } from '../inventory/inventory.entity';
import { Client } from '../clients/client.entity';
import { CashSession } from './cash-session.entity';
import { Sale } from './sale.entity';
import { SaleItem } from './sale-item.entity';
import { Payment } from './payment.entity';
import { InventoryMovement } from '../inventory/inventory-movement.entity';

import { CreatePosSaleDto } from './sales.dto';
import { SaleChannel, SaleStatus, PaymentStatus, CashSessionStatus } from '../../common/enums/sales.enums';
import { MovementType } from '../../common/enums/inventory.enums';

@Injectable()
export class PosService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Branch) private branchRepository: Repository<Branch>,
    @InjectRepository(Inventory) private inventoryRepository: Repository<Inventory>,
    private dataSource: DataSource
  ) {}

  private async getValidCashierBranch(userId: number) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { userRoles: { role: true } }
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario inválido o inactivo');
    }

    const isCashier = user.userRoles.some(ur => ur.role.name === 'CAJERO' && ur.active);
    if (!isCashier) {
      throw new UnauthorizedException('El usuario no tiene el rol CAJERO activo');
    }

    if (!user.branchId) {
      throw new BadRequestException('El cajero no tiene una sucursal asignada');
    }

    const branch = await this.branchRepository.findOne({ where: { id: user.branchId } });
    if (!branch || !branch.active) {
      throw new BadRequestException('La sucursal asignada no existe o está inactiva');
    }

    return branch.id;
  }

  async getPosProducts(userId: number) {
    const branchId = await this.getValidCashierBranch(userId);

    const inventories = await this.inventoryRepository.find({
      where: {
        branchId,
        variant: {
          active: true,
          product: { active: true }
        }
      },
      relations: {
        variant: {
          product: true,
          size: true,
          color: true
        }
      }
    });

    const results = [];

    for (const inv of inventories) {
      const available = inv.stock - inv.reserved;
      if (available > 0) {
        results.push({
          productId: inv.variant.product.id,
          variantId: inv.variant.id,
          productName: inv.variant.product.name,
          imageUrl: inv.variant.product.imageUrl,
          sku: inv.variant.sku,
          size: inv.variant.size.name,
          color: inv.variant.color.name,
          price: inv.variant.product.price,
          available
        });
      }
    }

    return results;
  }

  async createPosSale(userId: number, dto: CreatePosSaleDto) {
    // Basic verification without locking
    const branchId = await this.getValidCashierBranch(userId);

    // Consolidate and sort items
    const consolidatedMap = new Map<number, number>();
    for (const item of dto.items) {
      if (!consolidatedMap.has(item.variantId)) {
        consolidatedMap.set(item.variantId, 0);
      }
      consolidatedMap.set(item.variantId, (consolidatedMap.get(item.variantId) || 0) + item.quantity);
    }
    
    const consolidatedItems = Array.from(consolidatedMap.entries())
      .map(([variantId, quantity]) => ({ variantId, quantity }))
      .sort((a, b) => a.variantId - b.variantId);

    if (consolidatedItems.length === 0) {
      throw new BadRequestException('La venta debe tener al menos un item');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Verify Client if provided
      if (dto.clientId) {
        const client = await queryRunner.manager.findOne(Client, { where: { id: dto.clientId } });
        if (!client) {
          throw new NotFoundException('Cliente no encontrado');
        }
      }

      // 2. Verify CashSession OPEN
      const openSession = await queryRunner.manager.findOne(CashSession, {
        where: { cashierId: userId, status: CashSessionStatus.OPEN }
      });
      if (!openSession) {
        throw new BadRequestException('No existe una sesión de caja abierta');
      }
      if (openSession.branchId !== branchId) {
        throw new BadRequestException('La sesión de caja no corresponde a la sucursal actual');
      }

      let total = 0;
      const saleItemsToSave = [];
      const inventoryMovementsToSave = [];
      const inventoriesToUpdate = [];

      // 3. Pessimistic read and logic per item
      for (const item of consolidatedItems) {
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { branchId, variantId: item.variantId },
          relations: { variant: { product: true } },
          lock: { mode: 'pessimistic_write' }
        });

        if (!inventory) {
          throw new NotFoundException(`Inventario no encontrado para variante ${item.variantId} en esta sucursal`);
        }
        if (!inventory.variant.active || !inventory.variant.product.active) {
          throw new BadRequestException(`El producto de variante ${item.variantId} está inactivo`);
        }

        const available = inventory.stock - inventory.reserved;
        if (item.quantity <= 0) {
          throw new BadRequestException('La cantidad debe ser mayor a 0');
        }
        if (available < item.quantity) {
          throw new ConflictException(`Stock insuficiente para variante ${item.variantId}. Disponible: ${available}, Requerido: ${item.quantity}`);
        }

        // Calculation
        const unitPriceNum = Number(inventory.variant.product.price);
        const subtotalNum = unitPriceNum * item.quantity;
        total += subtotalNum;

        // SaleItem preparation
        const saleItem = queryRunner.manager.create(SaleItem, {
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: unitPriceNum,
          subtotal: subtotalNum,
          saleId: 0
        });
        saleItemsToSave.push(saleItem);

        // Update inventory logic
        inventory.stock -= item.quantity;
        inventoriesToUpdate.push(inventory);

        // Inventory movement preparation
        const movement = queryRunner.manager.create(InventoryMovement, {
          inventoryId: inventory.id,
          type: MovementType.VENTA,
          quantity: item.quantity,
          userId,
          observation: 'Venta POS'
        });
        inventoryMovementsToSave.push(movement);
      }

      // 4. Create Sale
      const sale = queryRunner.manager.create(Sale, {
        channel: SaleChannel.POS,
        status: SaleStatus.COMPLETADA,
        branchId,
        userId,
        cashSessionId: openSession.id,
        clientId: dto.clientId || undefined,
        subtotal: total,
        total: total
      });
      const savedSale = await queryRunner.manager.save(Sale, sale);

      // Save related entities
      for (const si of saleItemsToSave) {
        si.saleId = savedSale.id;
        await queryRunner.manager.save(SaleItem, si);
      }

      const payment = queryRunner.manager.create(Payment, {
        saleId: savedSale.id,
        amount: total,
        method: dto.paymentMethod as any,
        status: PaymentStatus.APROBADO
      });
      await queryRunner.manager.save(Payment, payment);

      for (const inv of inventoriesToUpdate) {
        await queryRunner.manager.save(Inventory, inv);
      }

      for (const mov of inventoryMovementsToSave) {
        mov.observation = `Venta POS #${savedSale.id}`;
        await queryRunner.manager.save(InventoryMovement, mov);
      }

      await queryRunner.commitTransaction();
      return savedSale;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
