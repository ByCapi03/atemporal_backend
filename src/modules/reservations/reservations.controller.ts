import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Headers, UnauthorizedException, Query } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto, UpdateReservationDto, CreatePaymentDto } from './reservation.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { BadRequestException } from '@nestjs/common';

@UseGuards(AuthGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  create(@Body() createReservationDto: CreateReservationDto, @Request() req: any) {
    return this.reservationsService.create(createReservationDto, req.user);
  }

  @Post(':id/create-payment')
  createPayment(
    @Param('id') id: string,
    @Body() body: CreatePaymentDto,
    @Request() req: any
  ) {
    return this.reservationsService.createPayment(+id, body.paymentOption, body.clientPlatform, req.user);
  }

  @Post(':id/reconcile-payment')
  reconcilePayment(
    @Param('id') id: string,
    @Request() req: any
  ) {
    return this.reservationsService.reconcilePayment(+id, req.user);
  }

  @Post('reconcile-session/:sessionId')
  reconcileSession(
    @Param('sessionId') sessionId: string,
    @Request() req: any
  ) {
    return this.reservationsService.reconcileSession(sessionId, req.user);
  }

  @Get('my')
  findMyReservations(@Request() req: any) {
    return this.reservationsService.findMyReservations(req.user);
  }

  @Get('my/:id')
  findOneMyReservation(@Param('id') id: string, @Request() req: any) {
    return this.reservationsService.findOneMyReservation(+id, req.user);
  }

  @Patch('my/:id/cancel')
  cancelMyReservation(@Param('id') id: string, @Request() req: any) {
    return this.reservationsService.cancelMyReservation(+id, req.user);
  }

  @Get()
  findAll(@Request() req: any, @Query('deliveryQueue') deliveryQueue?: string) {
    return this.reservationsService.findAll(req.user, deliveryQueue === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.reservationsService.findOne(+id, req.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateReservationDto: UpdateReservationDto, @Request() req: any) {
    return this.reservationsService.update(+id, updateReservationDto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reservationsService.remove(+id);
  }

  @Post(':id/deliver')
  deliver(@Param('id') id: string, @Request() req: any) {
    return this.reservationsService.deliver(+id, req.user);
  }

  @Post(':id/pay-and-deliver')
  payAndDeliver(@Param('id') id: string, @Body('method') method: string, @Request() req: any) {
    return this.reservationsService.payAndDeliver(+id, method, req.user);
  }
}

import { PaymentGatewayService } from '../sales/payment-gateway.service';
import { SalesService } from '../sales/sales.service';

@Controller('stripe/webhook')
export class StripeWebhookController {
  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly paymentGatewayService: PaymentGatewayService,
    private readonly salesService: SalesService
  ) {}

  @Post()
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Request() req: any
  ) {
    if (!signature) {
      throw new BadRequestException('Firma invalida');
    }
    
    try {
      const event = await this.paymentGatewayService.handleWebhook(req.body, signature, req.rawBody);
      
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        if (session.metadata?.flowType === 'PURCHASE') {
          if (session.payment_status === 'paid') {
            await this.salesService.confirmWebPurchase(session.metadata.saleId, session.metadata.paymentId, 'SUCCESS');
          }
        } else {
          if (session.payment_status === 'paid') {
            await this.reservationsService.confirmStripePayment(session.id, 'SUCCESS', session.amount_total / 100);
          }
        }
      } else if (event.type === 'checkout.session.expired') {
        const session = event.data.object as any;
        if (session.metadata?.flowType === 'PURCHASE') {
          await this.salesService.confirmWebPurchase(session.metadata.saleId, session.metadata.paymentId, 'FAIL');
        } else {
          await this.reservationsService.confirmStripePayment(session.id, 'FAIL', session.amount_total / 100);
        }
      } else if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as any;
        console.log('[STRIPE WEBHOOK] event.type:', event.type);
        console.log('[STRIPE WEBHOOK] paymentIntent.id:', paymentIntent.id);
        console.log('[STRIPE WEBHOOK] paymentIntent.metadata:', paymentIntent.metadata);

        if (paymentIntent.metadata?.flowType !== 'PURCHASE') {
          console.log('[STRIPE WEBHOOK] Executing confirmStripePayment for reservation');
          await this.reservationsService.confirmStripePayment(paymentIntent.id, 'SUCCESS', paymentIntent.amount_received / 100);
        } else {
          console.log('[STRIPE WEBHOOK] Skipped confirmStripePayment because flowType === PURCHASE');
        }
      } else if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object as any;
        if (paymentIntent.metadata?.flowType !== 'PURCHASE') {
          await this.reservationsService.confirmStripePayment(paymentIntent.id, 'FAIL', paymentIntent.amount / 100);
        }
      }
      return { received: true };
    } catch (err: any) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }
  }
}
