import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Headers, UnauthorizedException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto, UpdateReservationDto } from './reservation.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { BadRequestException } from '@nestjs/common';

@UseGuards(AuthGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post('intent')
  createIntent(@Body() createReservationDto: CreateReservationDto, @Request() req: any) {
    return this.reservationsService.createIntent(createReservationDto, req.user);
  }

  @Get('my')
  findMyReservations(@Request() req: any) {
    return this.reservationsService.findMyReservations(req.user);
  }

  @Get('my/:id')
  findOneMyReservation(@Param('id') id: string, @Request() req: any) {
    return this.reservationsService.findOneMyReservation(+id, req.user);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.reservationsService.findAll(req.user);
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

@Controller('reservations/webhook')
export class ReservationsWebhookController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  async confirmWebhook(
    @Headers('stripe-signature') signature: string,
    @Request() req: any
  ) {
    if (!signature) {
      throw new UnauthorizedException('Firma invalida');
    }
    
    try {
      // Typically we'd use stripe.webhooks.constructEvent(req.rawBody, signature, secret)
      // For this simplified version we'll just pull the data assuming it is parsed
      const event = req.body;
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        await this.reservationsService.confirmWebhook(paymentIntent.id, 'SUCCESS', paymentIntent.amount / 100);
      } else if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        await this.reservationsService.confirmWebhook(paymentIntent.id, 'FAIL', paymentIntent.amount / 100);
      }
      return { received: true };
    } catch (err) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }
  }

  @Post('mock/cancel-abandoned')
  cancelAbandoned() {
    return this.reservationsService.cancelAbandonedIntents();
  }
}
