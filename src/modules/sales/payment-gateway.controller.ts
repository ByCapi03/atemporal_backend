import { Controller, Post, Headers, Req, RawBodyRequest, BadRequestException } from '@nestjs/common';
import { PaymentGatewayService } from './payment-gateway.service';
import { Request } from 'express';

@Controller('payment-gateway')
export class PaymentGatewayController {
  constructor(private readonly paymentGatewayService: PaymentGatewayService) {}

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    // In a real app we would use req.rawBody and stripe.webhooks.constructEvent
    // For this implementation, we will pass the parsed body to the service
    // if rawBody is not available.
    
    return this.paymentGatewayService.handleWebhook(req.body, signature, req.rawBody);
  }
}
