import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from '../sales/sale.entity';
import { SaleItem } from '../sales/sale-item.entity';
import { Payment } from '../sales/payment.entity';
import { Inventory } from '../inventory/inventory.entity';
import { Reservation } from '../reservations/reservation.entity';
import { SaleStatus, SaleChannel, PaymentMethod } from '../../common/enums/sales.enums';
import { ReservationStatus } from '../../common/enums/reservation.enums';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Sale) private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleItem) private readonly saleItemRepository: Repository<SaleItem>,
    @InjectRepository(Payment) private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Inventory) private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Reservation) private readonly reservationRepository: Repository<Reservation>,
  ) {}

  private validateRoleAndGetBranch(user: any, requestedBranchId?: number): number | null {
    const isCajeroOnly = user.roles.includes('CAJERO') && !user.roles.includes('ADMIN') && !user.roles.includes('ENCARGADO');
    if (isCajeroOnly) {
      throw new ForbiddenException('Acceso denegado');
    }

    if (user.roles.includes('ENCARGADO')) {
      return user.branchId;
    }

    if (user.roles.includes('ADMIN') && requestedBranchId) {
      return Number(requestedBranchId);
    }

    return null; // ADMIN without specific branch filter (global)
  }

  async getSalesReport(query: any, user: any) {
    const branchId = this.validateRoleAndGetBranch(user, query.branchId);
    const effectiveStatuses = [SaleStatus.PAGADA, SaleStatus.COMPLETADA];

    const qb = this.saleRepository.createQueryBuilder('sale')
      .leftJoin('sale.branch', 'branch')
      .leftJoin('sale.payments', 'payment')
      .where('sale.status IN (:...statuses)', { statuses: effectiveStatuses });

    if (branchId) {
      qb.andWhere('sale.branchId = :branchId', { branchId });
    }

    if (query.channel) {
      qb.andWhere('sale.channel = :channel', { channel: query.channel });
    }

    if (query.paymentMethod) {
      qb.andWhere('payment.method = :paymentMethod', { paymentMethod: query.paymentMethod });
    }

    if (query.from) {
      qb.andWhere('sale.date >= :from', { from: new Date(query.from) });
    }

    if (query.to) {
      const endDate = new Date(query.to);
      endDate.setHours(23, 59, 59, 999);
      qb.andWhere('sale.date <= :to', { to: endDate });
    }

    // Clone QB for totals
    const sales = await qb.getMany();
    const salesCount = sales.length;
    const totalSalesAmount = sales.reduce((acc, s) => acc + Number(s.total), 0);
    const averageTicket = salesCount > 0 ? totalSalesAmount / salesCount : 0;

    // Units sold in those sales
    const saleIds = sales.map(s => s.id);
    let unitsSold = 0;
    if (saleIds.length > 0) {
      const unitsRaw = await this.saleItemRepository.createQueryBuilder('item')
        .select('SUM(item.quantity)', 'totalUnits')
        .where('item.saleId IN (:...saleIds)', { saleIds })
        .getRawOne();
      unitsSold = Number(unitsRaw?.totalUnits || 0);
    }

    // Sales by Day
    const daysMap: Record<string, { date: string; totalAmount: number; salesCount: number }> = {};
    sales.forEach(s => {
      const dayStr = new Date(s.date).toISOString().split('T')[0];
      if (!daysMap[dayStr]) {
        daysMap[dayStr] = { date: dayStr, totalAmount: 0, salesCount: 0 };
      }
      daysMap[dayStr].totalAmount += Number(s.total);
      daysMap[dayStr].salesCount += 1;
    });

    const salesByDay = Object.values(daysMap).sort((a, b) => a.date.localeCompare(b.date));

    // Sales by Channel
    const salesByChannel = {
      [SaleChannel.POS]: 0,
      [SaleChannel.WEB]: 0,
      [SaleChannel.MOVIL]: 0,
    };
    sales.forEach(s => {
      if (s.channel in salesByChannel) {
        salesByChannel[s.channel] += Number(s.total);
      }
    });

    // Sales by Branch
    const branchMap: Record<number, { branchId: number; branchName: string; totalAmount: number; salesCount: number }> = {};
    sales.forEach(s => {
      const bId = s.branchId;
      const bName = s.branch?.name || `Sucursal ${bId}`;
      if (!branchMap[bId]) {
        branchMap[bId] = { branchId: bId, branchName: bName, totalAmount: 0, salesCount: 0 };
      }
      branchMap[bId].totalAmount += Number(s.total);
      branchMap[bId].salesCount += 1;
    });
    const salesByBranch = Object.values(branchMap);

    // Sales by Payment Method
    let salesByPaymentMethod: { method: string; totalAmount: number; count: number }[] = [];
    if (saleIds.length > 0) {
      const pmRaw = await this.paymentRepository.createQueryBuilder('payment')
        .select('payment.method', 'method')
        .addSelect('SUM(payment.amount)', 'totalAmount')
        .addSelect('COUNT(payment.id)', 'count')
        .where('payment.saleId IN (:...saleIds)', { saleIds })
        .groupBy('payment.method')
        .getRawMany();

      salesByPaymentMethod = pmRaw.map(row => ({
        method: row.method,
        totalAmount: Number(row.totalAmount || 0),
        count: Number(row.count || 0)
      }));
    }

    return {
      totalSalesAmount,
      salesCount,
      averageTicket,
      unitsSold,
      salesByDay,
      salesByBranch,
      salesByChannel,
      salesByPaymentMethod,
    };
  }

  async getProductsReport(query: any, user: any) {
    const branchId = this.validateRoleAndGetBranch(user, query.branchId);
    const effectiveStatuses = [SaleStatus.PAGADA, SaleStatus.COMPLETADA];

    const qb = this.saleItemRepository.createQueryBuilder('item')
      .innerJoin('item.sale', 'sale')
      .innerJoin('item.variant', 'variant')
      .innerJoin('variant.product', 'product')
      .select('product.id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('product.imageUrl', 'imageUrl')
      .addSelect('SUM(item.quantity)', 'unitsSold')
      .addSelect('SUM(item.subtotal)', 'revenue')
      .where('sale.status IN (:...statuses)', { statuses: effectiveStatuses })
      .groupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('product.imageUrl')
      .orderBy('SUM(item.quantity)', 'DESC');

    if (branchId) {
      qb.andWhere('sale.branchId = :branchId', { branchId });
    }

    if (query.from) {
      qb.andWhere('sale.date >= :from', { from: new Date(query.from) });
    }

    if (query.to) {
      const endDate = new Date(query.to);
      endDate.setHours(23, 59, 59, 999);
      qb.andWhere('sale.date <= :to', { to: endDate });
    }

    const raw = await qb.getRawMany();

    return raw.map(row => ({
      productId: Number(row.productId),
      productName: row.productName,
      imageUrl: row.imageUrl || null,
      unitsSold: Number(row.unitsSold || 0),
      revenue: Number(row.revenue || 0)
    }));
  }

  async getInventoryReport(query: any, user: any) {
    const branchId = this.validateRoleAndGetBranch(user, query.branchId);

    const qb = this.inventoryRepository.createQueryBuilder('inv')
      .leftJoinAndSelect('inv.branch', 'branch')
      .leftJoinAndSelect('inv.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.size', 'size')
      .leftJoinAndSelect('variant.color', 'color');

    if (branchId) {
      qb.andWhere('inv.branchId = :branchId', { branchId });
    }

    const inventories = await qb.getMany();

    const lowStock = inventories
      .filter(inv => (inv.stock - inv.reserved) <= inv.stockMin && (inv.stock - inv.reserved) > 0)
      .map(inv => ({
        inventoryId: inv.id,
        branchName: inv.branch?.name || '',
        productName: inv.variant?.product?.name || '',
        sizeName: inv.variant?.size?.name || '',
        colorName: inv.variant?.color?.name || '',
        stock: inv.stock,
        reserved: inv.reserved,
        available: inv.stock - inv.reserved,
        stockMin: inv.stockMin
      }));

    const outOfStock = inventories
      .filter(inv => (inv.stock - inv.reserved) <= 0)
      .map(inv => ({
        inventoryId: inv.id,
        branchName: inv.branch?.name || '',
        productName: inv.variant?.product?.name || '',
        sizeName: inv.variant?.size?.name || '',
        colorName: inv.variant?.color?.name || '',
        stock: inv.stock,
        reserved: inv.reserved,
        available: inv.stock - inv.reserved
      }));

    const branchMap: Record<number, { branchId: number; branchName: string; totalStock: number; totalAvailable: number; totalReserved: number }> = {};
    inventories.forEach(inv => {
      const bId = inv.branchId;
      const bName = inv.branch?.name || `Sucursal ${bId}`;
      if (!branchMap[bId]) {
        branchMap[bId] = { branchId: bId, branchName: bName, totalStock: 0, totalAvailable: 0, totalReserved: 0 };
      }
      branchMap[bId].totalStock += inv.stock;
      branchMap[bId].totalReserved += inv.reserved;
      branchMap[bId].totalAvailable += (inv.stock - inv.reserved);
    });

    const availabilityByBranch = Object.values(branchMap);

    return {
      lowStock,
      outOfStock,
      availabilityByBranch
    };
  }

  async getReservationsReport(query: any, user: any) {
    const branchId = this.validateRoleAndGetBranch(user, query.branchId);

    const qb = this.reservationRepository.createQueryBuilder('res')
      .leftJoinAndSelect('res.branch', 'branch');

    if (branchId) {
      qb.andWhere('res.branchId = :branchId', { branchId });
    }

    if (query.from) {
      qb.andWhere('res.registrationDate >= :from', { from: new Date(query.from) });
    }

    if (query.to) {
      const endDate = new Date(query.to);
      endDate.setHours(23, 59, 59, 999);
      qb.andWhere('res.registrationDate <= :to', { to: endDate });
    }

    const reservations = await qb.getMany();

    const total = reservations.length;
    const pending = reservations.filter(r => r.status === ReservationStatus.PENDIENTE || r.status === ReservationStatus.CONFIRMADA || r.status === ReservationStatus.PREPARANDO || r.status === ReservationStatus.LISTA).length;
    const attended = reservations.filter(r => r.status === ReservationStatus.ATENDIDA).length;
    const cancelled = reservations.filter(r => r.status === ReservationStatus.CANCELADA).length;

    const branchMap: Record<number, { branchId: number; branchName: string; total: number; pending: number; attended: number; cancelled: number }> = {};
    reservations.forEach(r => {
      const bId = r.branchId;
      const bName = r.branch?.name || `Sucursal ${bId}`;
      if (!branchMap[bId]) {
        branchMap[bId] = { branchId: bId, branchName: bName, total: 0, pending: 0, attended: 0, cancelled: 0 };
      }
      branchMap[bId].total += 1;
      if (r.status === ReservationStatus.ATENDIDA) {
        branchMap[bId].attended += 1;
      } else if (r.status === ReservationStatus.CANCELADA) {
        branchMap[bId].cancelled += 1;
      } else {
        branchMap[bId].pending += 1;
      }
    });

    const byBranch = Object.values(branchMap);

    return {
      total,
      pending,
      attended,
      cancelled,
      byBranch
    };
  }
}
