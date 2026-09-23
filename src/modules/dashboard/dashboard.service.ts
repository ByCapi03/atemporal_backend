import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from '../sales/sale.entity';
import { Reservation } from '../reservations/reservation.entity';
import { Inventory } from '../inventory/inventory.entity';
import { SaleItem } from '../sales/sale-item.entity';
import { SaleStatus, SaleChannel } from '../../common/enums/sales.enums';
import { ReservationStatus } from '../../common/enums/reservation.enums';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Sale) private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Reservation) private readonly reservationRepository: Repository<Reservation>,
    @InjectRepository(Inventory) private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(SaleItem) private readonly saleItemRepository: Repository<SaleItem>,
  ) {}

  async getMetrics(user: any) {
    const isCajeroOnly = user.roles.includes('CAJERO') && !user.roles.includes('ADMIN') && !user.roles.includes('ENCARGADO');
    if (isCajeroOnly) {
      throw new ForbiddenException('Acceso denegado');
    }

    const isAdmin = user.roles.includes('ADMIN');
    const branchId = user.roles.includes('ENCARGADO') ? user.branchId : null;

    const effectiveStatuses = [SaleStatus.PAGADA, SaleStatus.COMPLETADA];
    const activeResStatuses = [
      ReservationStatus.PENDIENTE,
      ReservationStatus.CONFIRMADA,
      ReservationStatus.PREPARANDO,
      ReservationStatus.LISTA,
    ];

    // Today Date range
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // 1. Sales Today
    const todayQb = this.saleRepository.createQueryBuilder('sale')
      .select('SUM(sale.total)', 'totalAmount')
      .addSelect('COUNT(sale.id)', 'salesCount')
      .where('sale.status IN (:...statuses)', { statuses: effectiveStatuses })
      .andWhere('sale.date >= :start', { start: startOfToday })
      .andWhere('sale.date <= :end', { end: endOfToday });

    if (!isAdmin && branchId) {
      todayQb.andWhere('sale.branchId = :branchId', { branchId });
    }

    const todayRaw = await todayQb.getRawOne();
    const salesTodayAmount = Number(todayRaw?.totalAmount || 0);
    const salesTodayCount = Number(todayRaw?.salesCount || 0);

    // 2. Active Reservations
    const resQb = this.reservationRepository.createQueryBuilder('res')
      .where('res.status IN (:...statuses)', { statuses: activeResStatuses });

    if (!isAdmin && branchId) {
      resQb.andWhere('res.branchId = :branchId', { branchId });
    }

    const activeReservations = await resQb.getCount();

    // 3. Low Stock Count: (stock - reserved) <= stockMin
    const invQb = this.inventoryRepository.createQueryBuilder('inv')
      .where('(inv.stock - inv.reserved) <= inv.stockMin');

    if (!isAdmin && branchId) {
      invQb.andWhere('inv.branchId = :branchId', { branchId });
    }

    const lowStockCount = await invQb.getCount();

    // 4. Sales Last 7 Days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const last7Qb = this.saleRepository.createQueryBuilder('sale')
      .select("TO_CHAR(sale.date, 'YYYY-MM-DD')", 'dateStr')
      .addSelect('SUM(sale.total)', 'totalAmount')
      .addSelect('COUNT(sale.id)', 'salesCount')
      .where('sale.status IN (:...statuses)', { statuses: effectiveStatuses })
      .andWhere('sale.date >= :sevenDaysAgo', { sevenDaysAgo })
      .groupBy("TO_CHAR(sale.date, 'YYYY-MM-DD')")
      .orderBy("TO_CHAR(sale.date, 'YYYY-MM-DD')", 'ASC');

    if (!isAdmin && branchId) {
      last7Qb.andWhere('sale.branchId = :branchId', { branchId });
    }

    const last7Raw = await last7Qb.getRawMany();

    // Fill missing days in last 7 days array
    const salesLast7Days: { date: string; amount: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const match = last7Raw.find((r) => r.dateStr === dateStr);
      salesLast7Days.push({
        date: dateStr,
        amount: Number(match?.totalAmount || 0),
        count: Number(match?.salesCount || 0),
      });
    }

    // 5. Sales By Channel
    const channelQb = this.saleRepository.createQueryBuilder('sale')
      .select('sale.channel', 'channel')
      .addSelect('SUM(sale.total)', 'totalAmount')
      .where('sale.status IN (:...statuses)', { statuses: effectiveStatuses })
      .groupBy('sale.channel');

    if (!isAdmin && branchId) {
      channelQb.andWhere('sale.branchId = :branchId', { branchId });
    }

    const channelRaw = await channelQb.getRawMany();

    const salesByChannel = {
      [SaleChannel.POS]: 0,
      [SaleChannel.WEB]: 0,
      [SaleChannel.MOVIL]: 0,
    };

    channelRaw.forEach((row) => {
      if (row.channel in salesByChannel) {
        salesByChannel[row.channel as keyof typeof salesByChannel] = Number(row.totalAmount || 0);
      }
    });

    // 6. Top Products (Top 5 by unitsSold DESC)
    const topProdQb = this.saleItemRepository.createQueryBuilder('item')
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
      .orderBy('SUM(item.quantity)', 'DESC')
      .limit(5);

    if (!isAdmin && branchId) {
      topProdQb.andWhere('sale.branchId = :branchId', { branchId });
    }

    const topProdRaw = await topProdQb.getRawMany();

    const topProducts = topProdRaw.map((row) => ({
      productId: Number(row.productId),
      productName: row.productName,
      imageUrl: row.imageUrl || null,
      unitsSold: Number(row.unitsSold || 0),
      revenue: Number(row.revenue || 0),
    }));

    // 7. Sales By Branch (ADMIN only)
    let salesByBranch = undefined;
    if (isAdmin) {
      const branchQb = this.saleRepository.createQueryBuilder('sale')
        .leftJoin('sale.branch', 'branch')
        .select('branch.id', 'branchId')
        .addSelect('branch.name', 'branchName')
        .addSelect('SUM(sale.total)', 'totalAmount')
        .addSelect('COUNT(sale.id)', 'salesCount')
        .where('sale.status IN (:...statuses)', { statuses: effectiveStatuses })
        .groupBy('branch.id')
        .addGroupBy('branch.name');

      const branchRaw = await branchQb.getRawMany();
      salesByBranch = branchRaw.map((row) => ({
        branchId: Number(row.branchId),
        branchName: row.branchName || 'Desconocida',
        totalAmount: Number(row.totalAmount || 0),
        salesCount: Number(row.salesCount || 0),
      }));
    }

    return {
      salesTodayAmount,
      salesTodayCount,
      activeReservations,
      lowStockCount,
      salesLast7Days,
      salesByChannel,
      topProducts,
      ...(isAdmin ? { salesByBranch } : {}),
    };
  }
}
