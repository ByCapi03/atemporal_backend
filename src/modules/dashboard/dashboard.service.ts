import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from '../sales/sale.entity';
import { Reservation } from '../reservations/reservation.entity';
import { Inventory } from '../inventory/inventory.entity';
import { SaleItem } from '../sales/sale-item.entity';
import { User } from '../auth/user.entity';
import { SaleStatus, SaleChannel } from '../sales/sales.enums';
import { ReservationStatus } from '../reservations/reservation.enums';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Sale) private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Reservation) private readonly reservationRepository: Repository<Reservation>,
    @InjectRepository(Inventory) private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(SaleItem) private readonly saleItemRepository: Repository<SaleItem>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  async getMetrics(user: any, query: any = {}) {
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

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const startDate = query.startDate ? new Date(query.startDate) : startOfToday;
    const endDate = query.endDate ? new Date(query.endDate) : endOfToday;
    if (query.endDate) endDate.setHours(23, 59, 59, 999);

    const targetBranchId = isAdmin && query.branchId ? Number(query.branchId) : branchId;
    const targetChannel = query.channel;

    // 1. Sales Today (Or Date Range)
    const todayQb = this.saleRepository.createQueryBuilder('sale')
      .select('SUM(sale.total)', 'totalAmount')
      .addSelect('COUNT(sale.id)', 'salesCount')
      .where('sale.status IN (:...statuses)', { statuses: effectiveStatuses })
      .andWhere('sale.date >= :start', { start: startDate })
      .andWhere('sale.date <= :end', { end: endDate });

    if (targetBranchId) {
      todayQb.andWhere('sale.branchId = :branchId', { branchId: targetBranchId });
    }
    if (targetChannel) {
      todayQb.andWhere('sale.channel = :channel', { channel: targetChannel });
    }

    const todayRaw = await todayQb.getRawOne();
    const salesTodayAmount = Number(todayRaw?.totalAmount || 0);
    const salesTodayCount = Number(todayRaw?.salesCount || 0);

    // 2. Reservations breakdown
    const resQb = this.reservationRepository.createQueryBuilder('res')
      .where('res.status IN (:...statuses)', { statuses: activeResStatuses });

    if (targetBranchId) {
      resQb.andWhere('res.branchId = :branchId', { branchId: targetBranchId });
    }

    const activeReservationsRaw = await resQb.getMany();
    const activeReservations = activeReservationsRaw.length;
    
    let resPendientes = 0;
    let resConfirmadasPreparando = 0;
    let resListas = 0;

    activeReservationsRaw.forEach(r => {
      if (r.status === ReservationStatus.PENDIENTE) resPendientes++;
      else if (r.status === ReservationStatus.CONFIRMADA || r.status === ReservationStatus.PREPARANDO) resConfirmadasPreparando++;
      else if (r.status === ReservationStatus.LISTA) resListas++;
    });

    // 2.5. Active cashiers
    let activeCashiers = 0;
    const usersQb = this.userRepository.createQueryBuilder('user')
      .innerJoin('user.userRoles', 'userRole')
      .innerJoin('userRole.role', 'role')
      .where('role.name = :roleName', { roleName: 'CAJERO' })
      .andWhere('userRole.active = :urActive', { urActive: true })
      .andWhere('user.active = :active', { active: true });
      
    if (targetBranchId) {
      usersQb.andWhere('user.branchId = :branchId', { branchId: targetBranchId });
    }
    
    activeCashiers = await usersQb.getCount();

    // 3. Low Stock Count: (stock - reserved) <= stockMin
    const invQb = this.inventoryRepository.createQueryBuilder('inv')
      .where('(inv.stock - inv.reserved) <= inv.stockMin');

    if (targetBranchId) {
      invQb.andWhere('inv.branchId = :branchId', { branchId: targetBranchId });
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

    if (targetBranchId) {
      last7Qb.andWhere('sale.branchId = :branchId', { branchId: targetBranchId });
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

    if (targetBranchId) {
      channelQb.andWhere('sale.branchId = :branchId', { branchId: targetBranchId });
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

    if (targetBranchId) {
      topProdQb.andWhere('sale.branchId = :branchId', { branchId: targetBranchId });
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
        .andWhere('sale.date >= :start', { start: startDate })
        .andWhere('sale.date <= :end', { end: endDate })
        .groupBy('branch.id')
        .addGroupBy('branch.name');

      if (targetChannel) {
        branchQb.andWhere('sale.channel = :channel', { channel: targetChannel });
      }

      const branchRaw = await branchQb.getRawMany();
      salesByBranch = branchRaw.map((row) => ({
        branchId: Number(row.branchId),
        branchName: row.branchName || 'Desconocida',
        totalAmount: Number(row.totalAmount || 0),
        salesCount: Number(row.salesCount || 0),
      }));
    }

    // 8. Sales By Season and Collection
    const seasonQb = this.saleItemRepository.createQueryBuilder('item')
      .innerJoin('item.sale', 'sale')
      .innerJoin('item.variant', 'variant')
      .innerJoin('variant.product', 'product')
      .leftJoin('product.season', 'season')
      .select('season.name', 'seasonName')
      .addSelect('SUM(item.subtotal)', 'revenue')
      .where('sale.status IN (:...statuses)', { statuses: effectiveStatuses })
      .andWhere('season.id IS NOT NULL')
      .andWhere('sale.date >= :start', { start: startDate })
      .andWhere('sale.date <= :end', { end: endDate })
      .groupBy('season.id')
      .addGroupBy('season.name');

    if (targetBranchId) {
      seasonQb.andWhere('sale.branchId = :branchId', { branchId: targetBranchId });
    }
    if (targetChannel) {
      seasonQb.andWhere('sale.channel = :channel', { channel: targetChannel });
    }

    const seasonRaw = await seasonQb.getRawMany();
    const salesBySeason = seasonRaw.map(row => ({
      seasonName: row.seasonName,
      revenue: Number(row.revenue || 0)
    }));

    const collectionQb = this.saleItemRepository.createQueryBuilder('item')
      .innerJoin('item.sale', 'sale')
      .innerJoin('item.variant', 'variant')
      .innerJoin('variant.product', 'product')
      .leftJoin('product.collection', 'collection')
      .select('collection.name', 'collectionName')
      .addSelect('SUM(item.subtotal)', 'revenue')
      .where('sale.status IN (:...statuses)', { statuses: effectiveStatuses })
      .andWhere('collection.id IS NOT NULL')
      .andWhere('sale.date >= :start', { start: startDate })
      .andWhere('sale.date <= :end', { end: endDate })
      .groupBy('collection.id')
      .addGroupBy('collection.name');

    if (targetBranchId) {
      collectionQb.andWhere('sale.branchId = :branchId', { branchId: targetBranchId });
    }
    if (targetChannel) {
      collectionQb.andWhere('sale.channel = :channel', { channel: targetChannel });
    }

    const collectionRaw = await collectionQb.getRawMany();
    const salesByCollection = collectionRaw.map(row => ({
      collectionName: row.collectionName,
      revenue: Number(row.revenue || 0)
    }));

    return {
      salesTodayAmount,
      salesTodayCount,
      activeReservations,
      resPendientes,
      resConfirmadasPreparando,
      resListas,
      activeCashiers,
      lowStockCount,
      salesLast7Days,
      salesByChannel,
      topProducts,
      salesBySeason,
      salesByCollection,
      ...(isAdmin ? { salesByBranch } : {}),
    };
  }
}
