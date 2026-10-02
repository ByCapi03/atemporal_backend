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
    const amountInCents = Math.round(amount * 100);
    
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amountInCents,
      currency: process.env.STRIPE_CURRENCY || 'bob',
      metadata,
    });

    return {
      stripeId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret
    };
  }

  async retrievePaymentIntent(intentId: string): Promise<Stripe.Response<Stripe.PaymentIntent>> {
    return this.stripe.paymentIntents.retrieve(intentId);
  }

  async retrieveCheckoutSession(sessionId: string): Promise<Stripe.Response<Stripe.Checkout.Session>> {
    return this.stripe.checkout.sessions.retrieve(sessionId);
  }

  async cancelPaymentIntent(intentId: string) {
    try {
      await this.stripe.paymentIntents.cancel(intentId);
    } catch (err: any) {
      console.warn(`No se pudo cancelar el PaymentIntent ${intentId}: ${err.message}`);
    }
  }

  async createCheckoutSession(amount: number, metadata: any) {
    const amountInCents = Math.round(amount * 100);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: process.env.STRIPE_CURRENCY || 'bob',
            product_data: {
              name: 'Reserva Atemporal',
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: {
        metadata,
      },
      success_url: metadata.flowType === 'PURCHASE' 
        ? `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}` 
        : `${frontendUrl}/account/reservations?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: metadata.flowType === 'PURCHASE'
        ? `${frontendUrl}/checkout`
        : `${frontendUrl}/account/reservations?payment=cancelled`,
    });

    return {
      stripeId: session.id, // we save session ID as transaction reference. (Wait, webhook gets session.id or payment_intent.id? Webhook gets session.id and session.payment_intent)
      checkoutUrl: session.url
    };
  }

  async handleWebhook(body: any, signature: string, rawBody?: Buffer): Promise<any> {
    let event: Stripe.Event;

    // Ideally use constructEvent if we have rawBody (in production)
    if (rawBody && process.env.STRIPE_WEBHOOK_SECRET) {
      try {
        event = this.stripe.webhooks.constructEvent(
          rawBody,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err: any) {
        throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
      }
    } else {
      // For development/testing without raw body parser configured correctly
      event = body;
    }

    return event;
  }
}
