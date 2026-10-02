import { Controller, Post, Get, Param, Body, Req, UseGuards, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ReservationsService } from './reservations.service';
import { PaymentMethod } from '../sales/sales.enums';
import { DataSource } from 'typeorm';
import { Payment } from '../sales/payment.entity';

@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly dataSource: DataSource
  ) {}

  @Post('qr')
  async createQr(@Body() body: any, @Req() req: any) {
    if (body.reservationId) {
      return this.reservationsService.createPayment(
        body.reservationId, 
        body.paymentOption, 
        body.clientPlatform || 'web', 
        req.user,
        PaymentMethod.QR
      );
    }
    throw new NotFoundException('SaleId direct flow not implemented for QR yet.');
  }

  @Post('mobile-wallet')
  async createWallet(@Body() body: any, @Req() req: any) {
    if (body.reservationId) {
      return this.reservationsService.createPayment(
        body.reservationId, 
        body.paymentOption, 
        body.clientPlatform || 'web', 
        req.user,
        PaymentMethod.BILLETERA_MOVIL,
        body.phoneNumber
      );
    }
    throw new NotFoundException('SaleId direct flow not implemented for Wallet yet.');
  }

  @Post(':id/simulate/approve')
  async simulateApprove(@Param('id') id: string) {
    if (process.env.NODE_ENV === 'production' && process.env.PAYMENT_SIMULATION_ENABLED !== 'true') {
      throw new ForbiddenException('Simulation endpoints are disabled in production.');
    }
    return this.reservationsService.confirmPaymentById(parseInt(id), 'SUCCESS');
  }

  @Post(':id/simulate/reject')
  async simulateReject(@Param('id') id: string) {
    if (process.env.NODE_ENV === 'production' && process.env.PAYMENT_SIMULATION_ENABLED !== 'true') {
      throw new ForbiddenException('Simulation endpoints are disabled in production.');
    }
    return this.reservationsService.confirmPaymentById(parseInt(id), 'FAIL');
  }

  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    const payment = await this.dataSource.manager.findOne(Payment, { where: { id: parseInt(id) } });
    if (!payment) throw new NotFoundException('Payment not found');
    
    if (payment.expiresAt && new Date() > payment.expiresAt && payment.status === 'PENDIENTE') {
      // Auto-reject if expired
      await this.reservationsService.confirmPaymentById(payment.id, 'FAIL');
      return { status: 'RECHAZADO', expired: true };
    }

    return { status: payment.status };
  }
}

import * as jwt from 'jsonwebtoken';

@Controller('payments/qr')
export class PublicPaymentsController {
  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly dataSource: DataSource
  ) {}

  private verifyToken(token: string) {
    try {
      const jwtSecret = process.env.JWT_SECRET || 'secret';
      return jwt.verify(token, jwtSecret) as { paymentId: number };
    } catch (e) {
      throw new BadRequestException('Token inválido o expirado');
    }
  }

  @Get('confirm/:token')
  async getInfo(@Param('token') token: string) {
    console.log('[BACKEND QR GET]', { token });
    const { paymentId } = this.verifyToken(token);
    const payment = await this.dataSource.manager.findOne(Payment, { where: { id: paymentId } });
    
    if (!payment) {
      console.log('[BACKEND QR GET ERROR]', 'Pago no encontrado', { paymentId });
      throw new NotFoundException('Pago no encontrado');
    }

    console.log('[BACKEND QR GET SUCCESS]', {
      paymentId,
      status: payment.status,
      expiresAt: payment.expiresAt
    });

    return {
      reference: payment.transactionReference,
      amount: payment.amount,
      status: payment.status,
      expiresAt: payment.expiresAt
    };
  }

  @Post('confirm/:token')
  async confirmPayment(@Param('token') token: string) {
    const { paymentId } = this.verifyToken(token);
    const payment = await this.dataSource.manager.findOne(Payment, { where: { id: paymentId } });

    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.method !== PaymentMethod.QR || payment.provider !== 'DEMO_QR') {
      throw new BadRequestException('El pago no es de tipo QR');
    }

    if (payment.status === 'APROBADO') {
      return { alreadyProcessed: true, status: 'APROBADO' };
    }
    
    if (payment.status !== 'PENDIENTE') {
      throw new BadRequestException('El pago no está pendiente');
    }

    if (payment.expiresAt && new Date() > payment.expiresAt) {
      await this.reservationsService.confirmPaymentById(payment.id, 'FAIL');
      throw new BadRequestException('El código QR ha expirado');
    }

    return this.reservationsService.confirmPaymentById(payment.id, 'SUCCESS');
  }

  @Post('reject/:token')
  async rejectPayment(@Param('token') token: string) {
    if (process.env.PAYMENT_SIMULATION_ENABLED !== 'true') {
      throw new ForbiddenException('Simulation is disabled');
    }
    const { paymentId } = this.verifyToken(token);
    const payment = await this.dataSource.manager.findOne(Payment, { where: { id: paymentId } });

    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.status !== 'PENDIENTE') {
      throw new BadRequestException('El pago no está pendiente');
    }

    return this.reservationsService.confirmPaymentById(payment.id, 'FAIL');
  }
}
