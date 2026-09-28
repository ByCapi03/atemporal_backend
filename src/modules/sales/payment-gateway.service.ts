import { Injectable, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class PaymentGatewayService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
      apiVersion: '2025-01-27.acacia' as any, // Ignore type error for acacia version if it happens
    });
  }

  async createPaymentIntent(amount: number, metadata: any) {
    // Convert to cents (Bs 10.50 -> 1050)
    const amountInCents = Math.round(amount * 100);
    
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'bob',
      metadata,
    });

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret
    };
  }
}
