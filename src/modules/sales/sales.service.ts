/**
 * SALES SERVICE
 * Flujo de Ventas Generales: Lógica general de consultas. Se asegura, por ejemplo, 
 * de que en /sales/my un cliente vea exclusivamente las compras asociadas a su 
 * clientId y no las del resto del sistema.
 */
import { Injectable, NotFoundException, ForbiddenException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sale } from './sale.entity';
import { SaleItem } from './sale-item.entity';
import { Payment } from './payment.entity';
import { Client } from '../clients/client.entity';
import { Inventory } from '../inventory/inventory.entity';
import { InventoryMovement } from '../inventory/inventory-movement.entity';
import { MovementType } from '../inventory/inventory.enums';
import { CatalogPricingService } from '../catalog/catalog-pricing.service';
import { Variant } from '../catalog/variant.entity';
import { PaymentGatewayService } from './payment-gateway.service';
import { PaymentMethod } from './sales.enums';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly dataSource: DataSource,
    private readonly pricingService: CatalogPricingService,
    private readonly paymentGatewayService: PaymentGatewayService,
  ) {}

  private async getClientByUser(user: any): Promise<Client> {
    const client = await this.clientRepository.findOneBy({ userId: user.sub });
    if (!client) {
      throw new UnauthorizedException('El usuario no tiene un perfil de cliente asociado.');
    }
    return client;
  }

  async findMySales(user: any) {
    if (!user.roles?.includes('CLIENTE')) {
      throw new ForbiddenException('Endpoint exclusivo para clientes');
    }
    const client = await this.getClientByUser(user);

    const sales = await this.saleRepository.find({
      where: { clientId: client.id },
      relations: {
        branch: true,
        items: true,
      },
      order: { date: 'DESC' },
    });

    return sales.map((s) => ({
      id: s.id,
      date: s.date,
      branchName: s.branch?.name || '',
      channel: s.channel,
      status: s.status,
      total: Number(s.total),
      itemsCount: s.items ? s.items.reduce((acc, i) => acc + i.quantity, 0) : 0,
    }));
  }

  async findOneMySale(id: number, user: any) {
    if (!user.roles?.includes('CLIENTE')) {
      throw new ForbiddenException('Endpoint exclusivo para clientes');
    }
    const client = await this.getClientByUser(user);

    const sale = await this.saleRepository.findOne({
      where: { id, clientId: client.id },
      relations: {
        branch: true,
        items: { variant: { product: true, size: true, color: true } },
        payments: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Compra no encontrada');
    }

    return {
      id: sale.id,
      date: sale.date,
      branchName: sale.branch?.name || '',
      channel: sale.channel,
      status: sale.status,
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount || 0),
      total: Number(sale.total),
      items: (sale.items || []).map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        productName: item.variant?.product?.name || 'Producto',
        imageUrl: item.variant?.product?.imageUrl || null,
        sizeName: item.variant?.size?.name || '',
        colorName: item.variant?.color?.name || '',
      })),
      payments: (sale.payments || []).map((p) => ({
        id: p.id,
        method: p.method,
        status: p.status,
        amount: Number(p.amount),
      })),
    };
  }

  async checkoutWeb(body: any, user: any) {
    if (!user.roles?.includes('CLIENTE')) {
      throw new ForbiddenException('Endpoint exclusivo para clientes');
    }
    const client = await this.getClientByUser(user);
    const { branchId, items, clientPlatform } = body;

    if (!branchId || !items || items.length === 0) {
      throw new BadRequestException('Datos insuficientes');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let saleId: number;
    let paymentId: number;
    let totalSale = 0;
    let totalSubtotal = 0;
    let totalDiscount = 0;

    try {
      const saleItems: SaleItem[] = [];

      for (const item of items) {
        const variant = await queryRunner.manager.findOne(Variant, { 
          where: { id: item.variantId }, 
          relations: { product: { promotions: true } } 
        });
        if (!variant) throw new NotFoundException(`Variante ${item.variantId} no encontrada`);
        
        const pricing = this.pricingService.getEffectivePrice(variant.product);
        
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { branchId, variantId: item.variantId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!inventory) throw new BadRequestException(`Inventario no encontrado para variante ${item.variantId}`);
        const available = inventory.stock - inventory.reserved;
        if (item.quantity > available) throw new BadRequestException(`Stock insuficiente para variante ${item.variantId}`);

        inventory.reserved += item.quantity;
        await queryRunner.manager.save(inventory);

        const movement = queryRunner.manager.create(InventoryMovement, {
          inventoryId: inventory.id,
          type: MovementType.RESERVA,
          quantity: item.quantity,
          userId: user.sub,
          observation: 'Reserva temporal por Checkout WEB',
        });
        await queryRunner.manager.save(movement);

        const itemSubtotal = pricing.finalPrice * item.quantity;
        const itemOriginalSubtotal = pricing.basePrice * item.quantity;

        totalSubtotal += itemOriginalSubtotal;
        totalSale += itemSubtotal;
        totalDiscount += (itemOriginalSubtotal - itemSubtotal);

        const saleItem = queryRunner.manager.create(SaleItem, {
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: pricing.finalPrice,
          subtotal: itemSubtotal,
        });
        saleItems.push(saleItem);
      }

      const sale = queryRunner.manager.create(Sale, {
        clientId: client.id,
        branchId,
        channel: clientPlatform === 'mobile' ? 'MOVIL' as any : 'WEB' as any,
        status: 'PENDIENTE' as any,
        subtotal: totalSubtotal,
        discount: totalDiscount,
        total: totalSale,
      });

      const savedSale = await queryRunner.manager.save(sale);
      saleId = savedSale.id;

      for (const si of saleItems) {
        si.saleId = saleId;
        await queryRunner.manager.save(si);
      }

      const payment = queryRunner.manager.create(Payment, {
        saleId,
        amount: totalSale,
        method: PaymentMethod.TARJETA,
        status: 'PENDIENTE' as any,
        provider: 'STRIPE'
      });
      const savedPayment = await queryRunner.manager.save(payment);
      paymentId = savedPayment.id;

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    const metadata = {
      flowType: 'PURCHASE',
      saleId: saleId.toString(),
      paymentId: paymentId.toString(),
    };

    if (clientPlatform === 'mobile') {
      const result = await this.paymentGatewayService.createPaymentIntent(totalSale, metadata);
      // Update the payment with stripePaymentIntentId
      await this.saleRepository.manager.update(Payment, paymentId, { stripePaymentIntentId: result.stripeId });
      return { saleId, clientSecret: result.clientSecret };
    } else {
      const result = await this.paymentGatewayService.createCheckoutSession(totalSale, metadata);
      return { saleId, checkoutUrl: result.checkoutUrl };
    }
  }

  async confirmWebPurchase(saleId: string, paymentId: string, result: 'SUCCESS' | 'FAIL') {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const sale = await queryRunner.manager.findOne(Sale, {
        where: { id: parseInt(saleId) },
        relations: { items: true },
      });
      const payment = await queryRunner.manager.findOne(Payment, {
        where: { id: parseInt(paymentId) },
      });

      if (!sale || !payment) throw new NotFoundException('Venta o pago no encontrado');

      if (sale.status !== 'PENDIENTE' && sale.status !== ('EN_PROCESO' as any)) {
        await queryRunner.rollbackTransaction();
        return;
      }

      if (result === 'SUCCESS') {
        payment.status = 'APROBADO' as any;
        sale.status = 'COMPLETADA' as any;

        for (const item of sale.items) {
          const inventory = await queryRunner.manager.findOne(Inventory, {
            where: { branchId: sale.branchId, variantId: item.variantId },
            lock: { mode: 'pessimistic_write' },
          });
          
          if (inventory) {
            inventory.stock -= item.quantity;
            inventory.reserved = Math.max(0, inventory.reserved - item.quantity);
            await queryRunner.manager.save(inventory);

            const movement = queryRunner.manager.create(InventoryMovement, {
              inventoryId: inventory.id,
              type: MovementType.VENTA,
              quantity: item.quantity,
              userId: sale.clientId,
              observation: `Venta WEB #${sale.id}`,
            });
            await queryRunner.manager.save(movement);
          }
        }
      } else {
        payment.status = 'FALLIDO' as any;
        sale.status = 'CANCELADA' as any;

        for (const item of sale.items) {
          const inventory = await queryRunner.manager.findOne(Inventory, {
            where: { branchId: sale.branchId, variantId: item.variantId },
            lock: { mode: 'pessimistic_write' },
          });

          if (inventory) {
            inventory.reserved = Math.max(0, inventory.reserved - item.quantity);
            await queryRunner.manager.save(inventory);

            const movement = queryRunner.manager.create(InventoryMovement, {
              inventoryId: inventory.id,
              type: MovementType.LIBERACION_RESERVA,
              quantity: item.quantity,
              userId: sale.clientId,
              observation: `Cancelacion / Expiracion de Venta WEB #${sale.id}`,
            });
            await queryRunner.manager.save(movement);
          }
        }
      }

      await queryRunner.manager.save(payment);
      await queryRunner.manager.save(sale);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async cancelPendingSale(saleId: number, user: any) {
    if (!user.roles?.includes('CLIENTE')) {
      throw new ForbiddenException('Endpoint exclusivo para clientes');
    }
    const client = await this.getClientByUser(user);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const sale = await queryRunner.manager.findOne(Sale, {
        where: { id: saleId, clientId: client.id },
        relations: { items: true, payments: true },
        lock: { mode: 'pessimistic_write' },
      });

      if (!sale) {
        throw new NotFoundException('Compra no encontrada');
      }

      if (sale.status === ('CANCELADA' as any)) {
        await queryRunner.rollbackTransaction();
        return { success: true, message: 'La venta ya estaba cancelada' };
      }

      if (sale.status !== 'PENDIENTE') {
        throw new BadRequestException('Solo se pueden cancelar ventas pendientes');
      }

      const hasApprovedPayment = sale.payments && sale.payments.some(p => p.status === ('APROBADO' as any));
      if (hasApprovedPayment) {
        throw new BadRequestException('La venta tiene pagos aprobados, no se puede cancelar');
      }

      for (const item of sale.items) {
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { branchId: sale.branchId, variantId: item.variantId },
          lock: { mode: 'pessimistic_write' },
        });

        if (inventory) {
          inventory.reserved = Math.max(0, inventory.reserved - item.quantity);
          await queryRunner.manager.save(inventory);

          const movement = queryRunner.manager.create(InventoryMovement, {
            inventoryId: inventory.id,
            type: MovementType.LIBERACION_RESERVA,
            quantity: item.quantity,
            userId: user.sub,
            observation: `Cancelación manual de Checkout #${sale.id}`,
          });
          await queryRunner.manager.save(movement);
        }
      }

      sale.status = 'CANCELADA' as any;
      await queryRunner.manager.save(sale);

      if (sale.payments && sale.payments.length > 0) {
        for (const payment of sale.payments) {
          payment.status = 'RECHAZADO' as any;
          await queryRunner.manager.save(payment);

          if (payment.stripePaymentIntentId) {
            await this.paymentGatewayService.cancelPaymentIntent(payment.stripePaymentIntentId);
          }
        }
      }

      await queryRunner.commitTransaction();
      return { success: true, message: 'Venta cancelada correctamente' };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAllSales(query: any, user: any) {
    const isCajeroOnly = user.roles.includes('CAJERO') && !user.roles.includes('ADMIN') && !user.roles.includes('ENCARGADO');
    if (isCajeroOnly) {
      throw new ForbiddenException('Acceso denegado');
    }

    const qb = this.saleRepository.createQueryBuilder('sale')
      .leftJoinAndSelect('sale.branch', 'branch')
      .leftJoinAndSelect('sale.client', 'client')
      .leftJoinAndSelect('sale.user', 'user')
      .leftJoinAndSelect('sale.payments', 'payment');

    // Security: ENCARGADO is strictly scoped to user.branchId
    if (user.roles.includes('ENCARGADO')) {
      qb.andWhere('sale.branchId = :userBranch', { userBranch: user.branchId });
    } else if (user.roles.includes('ADMIN') && query.branchId) {
      qb.andWhere('sale.branchId = :branchId', { branchId: Number(query.branchId) });
    }

    if (query.channel) {
      qb.andWhere('sale.channel = :channel', { channel: query.channel });
    }

    if (query.status) {
      qb.andWhere('sale.status = :status', { status: query.status });
    }

    if (query.from) {
      qb.andWhere('sale.date >= :from', { from: new Date(query.from) });
    }

    if (query.to) {
      const endDate = new Date(query.to);
      endDate.setHours(23, 59, 59, 999);
      qb.andWhere('sale.date <= :to', { to: endDate });
    }

    if (query.paymentMethod) {
      qb.andWhere('payment.method = :paymentMethod', { paymentMethod: query.paymentMethod });
    }

    if (query.search) {
      const search = `%${query.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(client.name) LIKE :search OR LOWER(client.lastName) LIKE :search OR LOWER(client.email) LIKE :search OR CAST(sale.id AS TEXT) LIKE :search)',
        { search }
      );
    }

    qb.orderBy('sale.date', 'DESC');

    const sales = await qb.getMany();

    return sales.map(s => {
      const primaryPayment = s.payments && s.payments.length > 0 ? s.payments[0].method : null;
      return {
        id: s.id,
        date: s.date,
        clientName: s.client ? `${s.client.name} ${s.client.lastName || ''}`.trim() : 'Cliente General',
        clientEmail: s.client?.email || null,
        branchName: s.branch?.name || '',
        branchId: s.branchId,
        channel: s.channel,
        status: s.status,
        total: Number(s.total),
        paymentMethod: primaryPayment,
        registeredBy: s.user ? s.user.name : 'Sistema'
      };
    });
  }

  async findOneSale(id: number, user: any) {
    const isCajeroOnly = user.roles.includes('CAJERO') && !user.roles.includes('ADMIN') && !user.roles.includes('ENCARGADO');
    if (isCajeroOnly) {
      throw new ForbiddenException('Acceso denegado');
    }

    const sale = await this.saleRepository.findOne({
      where: { id },
      relations: {
        branch: true,
        client: true,
        user: true,
        items: { variant: { product: true, size: true, color: true } },
        payments: true
      }
    });

    if (!sale) throw new NotFoundException('Venta no encontrada');

    if (user.roles.includes('ENCARGADO') && sale.branchId !== user.branchId) {
      throw new ForbiddenException('No tienes acceso a ventas de otras sucursales');
    }

    return {
      id: sale.id,
      date: sale.date,
      channel: sale.channel,
      status: sale.status,
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount || 0),
      total: Number(sale.total),
      branch: { id: sale.branch.id, name: sale.branch.name },
      client: sale.client ? {
        id: sale.client.id,
        name: `${sale.client.name} ${sale.client.lastName || ''}`.trim(),
        email: sale.client.email,
        phone: sale.client.phone
      } : null,
      registeredBy: sale.user ? sale.user.name : 'Sistema',
      items: (sale.items || []).map(item => ({
        id: item.id,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        productName: item.variant?.product?.name || 'Producto',
        imageUrl: item.variant?.product?.imageUrl || null,
        sizeName: item.variant?.size?.name || '',
        colorName: item.variant?.color?.name || '',
        sku: item.variant?.sku || ''
      })),
      payments: (sale.payments || []).map(p => ({
        id: p.id,
        method: p.method,
        amount: Number(p.amount),
        status: p.status,
        date: p.date
      }))
    };
  }
}
