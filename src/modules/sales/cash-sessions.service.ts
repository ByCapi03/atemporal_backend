import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CashSession } from './cash-session.entity';
import { User } from '../auth/user.entity';
import { Branch } from '../branches/branch.entity';
import { OpenCashSessionDto, CloseCashSessionDto } from './sales.dto';
import { CashSessionStatus, PaymentStatus, SaleStatus, PaymentMethod } from '../../common/enums/sales.enums';
import { Payment } from './payment.entity';


@Injectable()
export class CashSessionsService {
  constructor(
    @InjectRepository(CashSession) private cashSessionRepository: Repository<CashSession>,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Branch) private branchRepository: Repository<Branch>,
  ) {}

  private async getValidCashierAndBranch(userId: number) {
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

    return { user, branch };
  }

  async openSession(userId: number, dto: OpenCashSessionDto) {
    const { user, branch } = await this.getValidCashierAndBranch(userId);

    const existingOpenSession = await this.cashSessionRepository.findOne({
      where: { cashierId: user.id, status: CashSessionStatus.OPEN }
    });

    if (existingOpenSession) {
      throw new ConflictException('Ya tienes una caja abierta. Ciérrala antes de abrir una nueva.');
    }

    const newSession = this.cashSessionRepository.create({
      branchId: branch.id,
      cashierId: user.id,
      openingAmount: dto.openingAmount,
      status: CashSessionStatus.OPEN
    });

    try {
      return await this.cashSessionRepository.save(newSession);
    } catch (error: any) {
      // Postgres unique constraint violation error code
      if (error.code === '23505') {
        throw new ConflictException('Ya tienes una caja abierta. Ciérrala antes de abrir una nueva.');
      }
      throw error;
    }
  }

  private async calculateSessionSummary(sessionId: number) {
    const payments = await this.cashSessionRepository.manager
      .createQueryBuilder(Payment, 'payment')
      .innerJoin('payment.sale', 'sale')
      .where('sale.cashSessionId = :sessionId', { sessionId })
      .andWhere('payment.status = :paymentStatus', { paymentStatus: PaymentStatus.APROBADO })
      .andWhere('sale.status IN (:...saleStatuses)', { saleStatuses: [SaleStatus.COMPLETADA, SaleStatus.PAGADA] })
      .select('payment.method', 'method')
      .addSelect('SUM(payment.amount)', 'total')
      .groupBy('payment.method')
      .getRawMany();

    let cashSales = 0;
    let cardSales = 0;
    let qrSales = 0;
    let transferSales = 0;

    payments.forEach(p => {
      const total = Number(p.total) || 0;
      switch (p.method) {
        case PaymentMethod.EFECTIVO:
          cashSales += total;
          break;
        case PaymentMethod.TARJETA:
          cardSales += total;
          break;
        case PaymentMethod.QR:
          qrSales += total;
          break;
        case PaymentMethod.TRANSFERENCIA:
          transferSales += total;
          break;
      }
    });

    const totalVendido = cashSales + cardSales + qrSales + transferSales;

    return {
      cashSales,
      cardSales,
      qrSales,
      transferSales,
      totalVendido
    };
  }

  async getCurrentSession(userId: number) {
    const { user, branch } = await this.getValidCashierAndBranch(userId);

    const openSession = await this.cashSessionRepository.findOne({
      where: { cashierId: user.id, status: CashSessionStatus.OPEN }
    });

    if (openSession) {
      const summary = await this.calculateSessionSummary(openSession.id);
      const expectedAmount = Number(openSession.openingAmount) + summary.cashSales;

      return {
        status: 'OPEN',
        session: {
          id: openSession.id,
          openingAmount: openSession.openingAmount,
          openedAt: openSession.openedAt,
          summary: {
            ...summary,
            expectedAmount
          }
        },
        branch: {
          id: branch.id,
          code: branch.id.toString(),
          name: branch.name
        }
      };
    }

    return {
      status: 'CLOSED',
      session: null,
      branch: {
        id: branch.id,
        code: branch.id.toString(),
        name: branch.name
      }
    };
  }

  async closeSession(userId: number, dto: CloseCashSessionDto) {
    const { user } = await this.getValidCashierAndBranch(userId);

    const openSession = await this.cashSessionRepository.findOne({
      where: { cashierId: user.id, status: CashSessionStatus.OPEN }
    });

    if (!openSession) {
      throw new BadRequestException('No tienes una caja abierta para cerrar.');
    }

    const summary = await this.calculateSessionSummary(openSession.id);
    const expectedAmount = Number(openSession.openingAmount) + summary.cashSales;
    const difference = dto.closingAmount - expectedAmount;

    openSession.closingAmount = dto.closingAmount;
    openSession.expectedAmount = expectedAmount;
    openSession.difference = difference;
    openSession.closedAt = new Date();
    openSession.status = CashSessionStatus.CLOSED;

    return await this.cashSessionRepository.save(openSession);
  }
}
