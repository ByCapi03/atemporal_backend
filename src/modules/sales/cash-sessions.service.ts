import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CashSession } from './cash-session.entity';
import { User } from '../auth/user.entity';
import { Branch } from '../branches/branch.entity';
import { OpenCashSessionDto } from './sales.dto';
import { CashSessionStatus } from '../../common/enums/sales.enums';


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

  async getCurrentSession(userId: number) {
    const { user, branch } = await this.getValidCashierAndBranch(userId);

    const openSession = await this.cashSessionRepository.findOne({
      where: { cashierId: user.id, status: CashSessionStatus.OPEN }
    });

    if (openSession) {
      return {
        status: 'OPEN',
        session: {
          id: openSession.id,
          openingAmount: openSession.openingAmount,
          openedAt: openSession.openedAt
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
}
