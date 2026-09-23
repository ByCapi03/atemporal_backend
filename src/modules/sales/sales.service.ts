import { Injectable, NotFoundException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from './sale.entity';
import { Client } from '../clients/client.entity';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  private async getClientByUser(user: any): Promise<Client> {
    const client = await this.clientRepository.findOneBy({ userId: user.sub });
    if (!client) {
      throw new UnauthorizedException('El usuario no tiene un perfil de cliente asociado.');
    }
    return client;
  }

  async findMySales(user: any) {
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
