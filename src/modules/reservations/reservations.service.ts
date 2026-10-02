import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException, ConflictException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';

import { CreateReservationDto, UpdateReservationDto } from './reservation.dto';
import { Reservation } from './reservation.entity';
import { ReservationItem } from './reservation-item.entity';
import { Client } from '../clients/client.entity';
import { Inventory } from '../inventory/inventory.entity';
import { InventoryMovement } from '../inventory/inventory-movement.entity';
import { Branch } from '../branches/branch.entity';
import { Variant } from '../catalog/variant.entity';
import { NotificationsService } from '../notifications/notifications.service';

import { ReservationStatus } from './reservation.enums';
import { MovementType } from '../inventory/inventory.enums';
import { Sale } from '../sales/sale.entity';
import { SaleItem } from '../sales/sale-item.entity';
import { Payment } from '../sales/payment.entity';
import { SaleChannel, SaleStatus, PaymentMethod, PaymentStatus } from '../sales/sales.enums';
import { AppGateway } from '../../common/realtime/app.gateway';
import { PaymentGatewayService } from '../sales/payment-gateway.service';
import { CatalogPricingService } from '../catalog/catalog-pricing.service';
import * as jwt from 'jsonwebtoken';
import * as qrcode from 'qrcode';

export interface PaymentSummary {
  total: number;
  paidAmount: number;
  remainingAmount: number;
  depositAmount: number;
  paymentState: 'PENDIENTE' | 'PARCIAL' | 'PAGADO';
}

@Injectable()
export class ReservationsService implements OnModuleInit {
  constructor(
    @InjectRepository(Reservation) private reservationRepository: Repository<Reservation>,
    @InjectRepository(ReservationItem) private reservationItemRepository: Repository<ReservationItem>,
    @InjectRepository(Client) private clientRepository: Repository<Client>,
    @InjectRepository(Inventory) private inventoryRepository: Repository<Inventory>,
    private dataSource: DataSource,
    private notificationsService: NotificationsService,
    private readonly appGateway: AppGateway,
    private readonly paymentGatewayService: PaymentGatewayService,
    private readonly catalogPricingService: CatalogPricingService,
  ) {}

  onModuleInit() {
    setInterval(() => {
      this.cancelAbandonedIntents().catch(e => console.error('[CRON] Error cancelAbandonedIntents:', e));
    }, 60000);
  }

  private async getClientByUser(user: any): Promise<Client> {
    const client = await this.clientRepository.findOneBy({ userId: user.sub });
    if (!client) {
      throw new UnauthorizedException('El usuario no tiene un perfil de cliente asociado.');
    }
    return client;
  }

  private calculatePaymentSummary(reservation: Reservation): PaymentSummary {
    let total = 0;
    if (reservation.sale && reservation.sale.total) {
      total = Number(reservation.sale.total);
    } else if (reservation.items) {
      total = reservation.items.reduce((sum, item) => {
        const price = item.variant?.product?.price || 0;
        return sum + (Number(price) * item.quantity);
      }, 0);
    }
    total = Number(total.toFixed(2));
    
    let paidAmount = 0;
    if (reservation.sale && reservation.sale.payments) {
      paidAmount = reservation.sale.payments
        .filter(p => p.status === PaymentStatus.APROBADO)
        .reduce((sum, p) => sum + Number(p.amount), 0);
    }
    paidAmount = Number(paidAmount.toFixed(2));
    
    const remainingAmount = Number((total - paidAmount).toFixed(2));
    const depositAmount = Number((total * 0.3).toFixed(2));
    
    let paymentState: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' = 'PENDIENTE';
    if (paidAmount >= total && total > 0) paymentState = 'PAGADO';
    else if (paidAmount > 0) paymentState = 'PARCIAL';

    return {
      total,
      paidAmount,
      remainingAmount,
      depositAmount,
      paymentState
    };
  }

  async create(createReservationDto: CreateReservationDto, user: any) {
    const client = await this.getClientByUser(user);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validar branch
      const branch = await queryRunner.manager.findOne(Branch, { where: { id: createReservationDto.branchId, active: true } });
      if (!branch) throw new NotFoundException(`La sucursal ${createReservationDto.branchId} no existe o no está activa`);

      // Crear Entidad Reserva (PENDIENTE esperando pago)
      const reservation = queryRunner.manager.create(Reservation, {
        status: ReservationStatus.PENDIENTE,
        date: createReservationDto.date,
        approximateTime: createReservationDto.approximateTime,
        clientId: client.id,
        branchId: createReservationDto.branchId,
      });
      const savedReservation = await queryRunner.manager.save(reservation);

      let total = 0;
      const reservationItemsToSave = [];
      const saleItemsToSave = [];
      const inventoriesToUpdate = [];
      const inventoryMovementsToSave = [];

      for (const itemDto of createReservationDto.items) {
        // Validar variante y producto
        const variant = await queryRunner.manager.findOne(Variant, { where: { id: itemDto.variantId, active: true }, relations: { product: true } });
        if (!variant || !variant.product.active) {
          throw new NotFoundException(`La variante ${itemDto.variantId} no está disponible`);
        }

        // Buscar y bloquear inventario
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { branchId: createReservationDto.branchId, variantId: itemDto.variantId },
          lock: { mode: 'pessimistic_write' }
        });

        if (!inventory) throw new BadRequestException(`No hay inventario para la variante ${itemDto.variantId} en esta sucursal`);

        const available = inventory.stock - inventory.reserved;
        if (available < itemDto.quantity) {
          throw new BadRequestException(`Stock insuficiente para la variante ${itemDto.variantId}. Disponible: ${available}`);
        }

        const pricing = this.catalogPricingService.getEffectivePrice(variant.product);
        const unitPriceNum = Number(pricing.finalPrice);
        const subtotalNum = Number((unitPriceNum * itemDto.quantity).toFixed(2));
        total += subtotalNum;

        // Preparar ReservationItem
        const resItem = queryRunner.manager.create(ReservationItem, {
          quantity: itemDto.quantity,
          reservationId: savedReservation.id,
          variantId: itemDto.variantId,
        });
        reservationItemsToSave.push(resItem);

        // Preparar SaleItem
        const saleItem = queryRunner.manager.create(SaleItem, {
          variantId: itemDto.variantId,
          quantity: itemDto.quantity,
          unitPrice: unitPriceNum,
          subtotal: subtotalNum,
          saleId: 0 // Se actualiza despues de guardar Sale
        });
        saleItemsToSave.push(saleItem);

        // HOLD inventory independientemente de la opcion de pago
        inventory.reserved += itemDto.quantity;
        inventoriesToUpdate.push(inventory);
        
        const movement = queryRunner.manager.create(InventoryMovement, {
          inventoryId: inventory.id,
          type: MovementType.RESERVA,
          quantity: itemDto.quantity,
          userId: user.sub,
          notes: `Reserva #${savedReservation.id} (HOLD pasarela)`
        });
        inventoryMovementsToSave.push(movement);
      }

      total = Number(total.toFixed(2));

      // Crear Sale
      const sale = queryRunner.manager.create(Sale, {
        channel: createReservationDto.clientPlatform === 'mobile' ? SaleChannel.MOVIL : SaleChannel.WEB,
        status: SaleStatus.PENDIENTE,
        branchId: createReservationDto.branchId,
        clientId: client.id,
        reservationId: savedReservation.id,
        subtotal: total,
        total: total,
        userId: user.sub,
      });
      const savedSale = await queryRunner.manager.save(Sale, sale);

      // Guardar ReservationItems y SaleItems
      for (const resItem of reservationItemsToSave) {
        await queryRunner.manager.save(ReservationItem, resItem);
      }
      for (const si of saleItemsToSave) {
        si.saleId = savedSale.id;
        await queryRunner.manager.save(SaleItem, si);
      }

      // Guardar Inventario
      for (const inv of inventoriesToUpdate) {
        await queryRunner.manager.save(Inventory, inv);
      }
      for (const mov of inventoryMovementsToSave) {
        await queryRunner.manager.save(InventoryMovement, mov);
      }

      await queryRunner.commitTransaction();

      return {
        reservationId: savedReservation.id,
        saleId: savedSale.id,
        total: total
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async createPayment(id: number, paymentOption: 'DEPOSIT_30' | 'FULL', clientPlatform: 'web' | 'mobile', user: any, method: PaymentMethod = PaymentMethod.TARJETA, phoneNumber?: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const client = await queryRunner.manager.findOne(Client, {
        where: { userId: user.sub }
      });
      if (!client) {
        throw new UnauthorizedException('El usuario no tiene un perfil de cliente asociado.');
      }

      const reservation = await queryRunner.manager
        .createQueryBuilder(Reservation, 'reservation')
        .where('reservation.id = :id', { id })
        .andWhere('reservation.clientId = :clientId', { clientId: client.id })
        .setLock('pessimistic_write')
        .getOne();

      if (!reservation) {
        throw new NotFoundException('Reserva no encontrada o no autorizada');
      }
      if (reservation.status !== ReservationStatus.PENDIENTE && reservation.status !== ReservationStatus.CONFIRMADA) {
        throw new BadRequestException('La reserva no esta en estado válido para pagar');
      }

      const sale = await queryRunner.manager.findOne(Sale, {
        where: { reservationId: reservation.id },
        relations: { payments: true }
      });

      if (!sale) {
        throw new BadRequestException('La reserva no tiene una venta asociada');
      }

      const total = Number(sale.total);
      const paidAmount = sale.payments ? sale.payments.filter(p => p.status === PaymentStatus.APROBADO).reduce((sum, p) => sum + Number(p.amount), 0) : 0;
      const remainingAmount = Number((total - paidAmount).toFixed(2));

      if (remainingAmount <= 0) {
        throw new BadRequestException('La reserva ya está pagada completamente');
      }

      let amountToPay = 0;
      if (paymentOption === 'DEPOSIT_30') {
         if (paidAmount > 0) throw new BadRequestException('El depósito ya fue realizado');
         amountToPay = Number((total * 0.3).toFixed(2));
      } else {
         amountToPay = remainingAmount; // 'FULL' covers the remaining balance
      }

      const metadata = {
        reservationId: reservation.id.toString(),
        saleId: sale.id.toString(),
        paymentOption: paymentOption,
        flowType: 'RESERVATION'
      };

      console.log('[CREATE PAYMENT]', {
        reservationId: reservation.id,
        paymentOption,
        expectedAmount: amountToPay
      });

      const pendingPayments = sale.payments?.filter(p => p.status === PaymentStatus.PENDIENTE && p.stripePaymentIntentId) || [];
      
      let reusedPayment = null;

      for (const p of pendingPayments) {
        if (clientPlatform !== 'mobile') continue;

        const pi = await this.paymentGatewayService.retrievePaymentIntent(p.stripePaymentIntentId);
        
        if (pi.status === 'succeeded') {
           await queryRunner.commitTransaction();
           await this.confirmStripePayment(p.stripePaymentIntentId, 'SUCCESS', Number(p.amount));
           throw new ConflictException('Un pago ya fue completado exitosamente para esta reserva.');
        }
        
        if (pi.status === 'processing') {
           await queryRunner.rollbackTransaction();
           throw new ConflictException('Un pago se encuentra procesandose en Stripe.');
        }

        if (pi.status === 'requires_payment_method' || pi.status === 'canceled') {
           if (Number(p.amount) === amountToPay && !reusedPayment && pi.status !== 'canceled') {
              reusedPayment = { paymentId: p.id, stripeId: pi.id, clientSecret: pi.client_secret };
           } else {
              if (pi.status === 'requires_payment_method') {
                 await this.paymentGatewayService.cancelPaymentIntent(p.stripePaymentIntentId);
              }
              p.status = PaymentStatus.RECHAZADO;
              await queryRunner.manager.save(Payment, p);
           }
        }
      }

      if (reusedPayment) {
        console.log('[CREATE PAYMENT] Reutilizando PaymentIntent existente', { 
          paymentId: reusedPayment.paymentId, 
          paymentIntentId: reusedPayment.stripeId,
          reused: true 
        });
        await queryRunner.commitTransaction();
        return reusedPayment;
      }

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5);

      const payment = queryRunner.manager.create(Payment, {
        saleId: sale.id,
        amount: amountToPay,
        method: method,
        status: PaymentStatus.PENDIENTE,
        provider: method === PaymentMethod.BILLETERA_MOVIL ? 'DEMO_WALLET' : (method === PaymentMethod.TARJETA ? 'STRIPE' : (method === PaymentMethod.QR ? 'DEMO_QR' : undefined)),
        expiresAt: (method === PaymentMethod.QR || method === PaymentMethod.BILLETERA_MOVIL) ? expiresAt : undefined
      });
      await queryRunner.manager.save(Payment, payment);

      let responsePayload: any = {};

      if (method === PaymentMethod.QR) {
         const jwtSecret = process.env.JWT_SECRET || 'secret';
         const token = jwt.sign({ paymentId: payment.id }, jwtSecret, { expiresIn: '5m' });
         const qrUrl = process.env.QR_PUBLIC_WEB_URL || 'http://localhost:5173';
         const confirmationUrl = `${qrUrl}/qr-payment/${token}`;
         const qrImage = await qrcode.toDataURL(confirmationUrl);
         
         payment.transactionReference = `QR-${payment.id}`;
         payment.externalReference = payment.transactionReference;
         await queryRunner.manager.save(Payment, payment);

         responsePayload = {
            reference: payment.transactionReference,
            amount: amountToPay,
            confirmationUrl: confirmationUrl,
            qrImage: qrImage
         };
      } else if (method === PaymentMethod.BILLETERA_MOVIL) {
         payment.transactionReference = `WALLET-${payment.id}`;
         payment.externalReference = payment.transactionReference;
         await queryRunner.manager.save(Payment, payment);

         responsePayload = {
            reference: payment.transactionReference,
            amount: amountToPay,
            status: 'PENDIENTE'
         };
      } else {
         if (clientPlatform === 'web') {
            responsePayload = await this.paymentGatewayService.createCheckoutSession(amountToPay, metadata);
         } else {
            responsePayload = await this.paymentGatewayService.createPaymentIntent(amountToPay, metadata);
         }
         payment.transactionReference = responsePayload.stripeId || responsePayload.reference;
         payment.stripePaymentIntentId = responsePayload.stripeId || undefined;
         payment.externalReference = responsePayload.reference || undefined;
         await queryRunner.manager.save(Payment, payment);
      }

      await queryRunner.commitTransaction();

      return {
        paymentId: payment.id,
        ...responsePayload
      };

    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async confirmPaymentTransaction(payment: Payment, status: 'SUCCESS' | 'FAIL', amount: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Re-fetch with relations
      const p = await queryRunner.manager.findOne(Payment, {
        where: { id: payment.id },
        relations: { sale: { reservation: { items: true, client: true } } }
      });

      if (!p) throw new NotFoundException('Pago no encontrado');
      if (Number(p.amount) !== amount) throw new BadRequestException('El monto pagado no coincide con el registrado');
      if (p.status !== PaymentStatus.PENDIENTE) {
        await queryRunner.rollbackTransaction();
        return { message: 'Already processed' };
      }

      const sale = p.sale;
      const reservation = sale.reservation;

      if (!sale || !reservation) throw new BadRequestException('El pago no esta asociado a una reserva valida');

      const lockedRes = await queryRunner.manager.findOne(Reservation, { where: { id: reservation.id }, lock: { mode: 'pessimistic_write' }});
      const lockedSale = await queryRunner.manager.findOne(Sale, { where: { id: sale.id }, lock: { mode: 'pessimistic_write' }});

      if (!lockedRes || !lockedSale) {
        await queryRunner.rollbackTransaction();
        return { message: 'Reservation or Sale not found' };
      }

      if (lockedRes.status !== ReservationStatus.PENDIENTE) {
         p.status = PaymentStatus.RECHAZADO;
         await queryRunner.manager.save(p);
         await queryRunner.commitTransaction();
         return { message: 'Reservation already processed' };
      }

      if (status === 'SUCCESS') {
        p.status = PaymentStatus.APROBADO;
        reservation.status = ReservationStatus.CONFIRMADA;
        
        const isFull = Number(p.amount) === Number(sale.total);
        if (isFull) {
          sale.status = SaleStatus.COMPLETADA;
          for (const item of reservation.items) {
             const inventory = await queryRunner.manager.findOne(Inventory, {
                where: { branchId: reservation.branchId, variantId: item.variantId },
                lock: { mode: 'pessimistic_write' }
             });
             if (inventory) {
               inventory.stock -= item.quantity;
               inventory.reserved -= item.quantity;
               await queryRunner.manager.save(inventory);
               const movement = queryRunner.manager.create(InventoryMovement, {
                  inventoryId: inventory.id,
                  type: MovementType.VENTA,
                  quantity: item.quantity,
                  userId: sale.userId,
                  notes: `Venta por reserva #${reservation.id} (pago completo confirmado)`
               });
               await queryRunner.manager.save(movement);
             }
          }
        } else {
           sale.status = SaleStatus.PENDIENTE;
        }
        
        await queryRunner.manager.save(p);
        await queryRunner.manager.save(sale);
        await queryRunner.manager.save(reservation);
        
        await queryRunner.commitTransaction();

        const clientName = `${reservation.client.name} ${reservation.client.lastName}`;
        this.notificationsService.notifyReservationCreated(reservation.branchId, reservation, clientName).catch(e => console.error(e));
        this.notificationsService.notifyReservationPaid(reservation.branchId, reservation, clientName, reservation.client.userId).catch(e => console.error(e));
        
      } else {
        p.status = PaymentStatus.RECHAZADO;
        reservation.status = ReservationStatus.CANCELADA;
        sale.status = SaleStatus.PENDIENTE;
        
        for (const item of reservation.items) {
             const inventory = await queryRunner.manager.findOne(Inventory, {
                where: { branchId: reservation.branchId, variantId: item.variantId },
                lock: { mode: 'pessimistic_write' }
             });
             if (inventory) {
               inventory.reserved -= item.quantity;
               await queryRunner.manager.save(inventory);
               const movement = queryRunner.manager.create(InventoryMovement, {
                  inventoryId: inventory.id,
                  type: MovementType.LIBERACION_RESERVA,
                  quantity: item.quantity,
                  userId: sale.userId,
                  notes: `Pago fallido - Liberacion reserva #${reservation.id}`
               });
               await queryRunner.manager.save(movement);
             }
        }
        
        await queryRunner.manager.save(p);
        await queryRunner.manager.save(sale);
        await queryRunner.manager.save(reservation);
        await queryRunner.commitTransaction();
      }
      return { success: true };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async confirmStripePayment(paymentIntentId: string, status: 'SUCCESS' | 'FAIL', amount: number) {
    const payment = await this.dataSource.manager.findOne(Payment, { where: { stripePaymentIntentId: paymentIntentId } });
    if (!payment) throw new NotFoundException('Intento de pago no encontrado');
    return this.confirmPaymentTransaction(payment, status, amount);
  }

  async confirmPaymentById(paymentId: number, status: 'SUCCESS' | 'FAIL') {
    const payment = await this.dataSource.manager.findOne(Payment, { where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    return this.confirmPaymentTransaction(payment, status, Number(payment.amount));
  }

  async reconcileSession(sessionId: string, user: any): Promise<{ success: boolean; paymentStatus: string | null }> {
    try {
      const client = await this.clientRepository.findOne({ where: { userId: user.sub } });
      if (!client) throw new UnauthorizedException('Perfil de cliente no encontrado');
      
      const payment = await this.dataSource.manager.findOne(Payment, { 
        where: { stripePaymentIntentId: sessionId },
        relations: { sale: { reservation: true } }
      });
      
      if (!payment || !payment.sale || !payment.sale.reservation) {
         throw new NotFoundException('Pago o reserva no encontrada para esta sesión');
      }
      
      if (payment.sale.reservation.clientId !== client.id) {
         throw new ForbiddenException('No tienes permiso para reconciliar esta reserva');
      }

      const session = await this.paymentGatewayService.retrieveCheckoutSession(sessionId);
      
      if (session.payment_status === 'paid') {
         await this.confirmStripePayment(sessionId, 'SUCCESS', session.amount_total ? session.amount_total / 100 : Number(payment.amount));
      } else if (session.status === 'expired' || session.status === 'open') {
         // Si esta open pero venimos de return, podria seguir pendiente.
         // Lo dejamos en PENDIENTE.
      }
      
      return { success: true, paymentStatus: session.payment_status };
    } catch (e: any) {
      console.error('[RECONCILE SESSION ERROR]', e);
      throw new BadRequestException(e.message || 'Error en reconciliacion por sesion');
    }
  }

  async reconcilePayment(id: number, user: any) {
    try {
      const client = await this.clientRepository.findOne({ where: { userId: user.sub } });
      if (!client) throw new UnauthorizedException('Perfil de cliente no encontrado');
      const reservation = await this.reservationRepository.findOne({
        where: { id, clientId: client.id },
        relations: { sale: { payments: true } }
      });
      if (!reservation || !reservation.sale) throw new NotFoundException('Reserva no encontrada');

      const pendingPayments = reservation.sale.payments?.filter(p => p.status === PaymentStatus.PENDIENTE && p.stripePaymentIntentId) || [];
      
      for (const payment of pendingPayments) {
        if (payment.stripePaymentIntentId.startsWith('cs_')) {
           const session = await this.paymentGatewayService.retrieveCheckoutSession(payment.stripePaymentIntentId);
           if (session.payment_status === 'paid') {
             await this.confirmStripePayment(payment.stripePaymentIntentId, 'SUCCESS', session.amount_total ? session.amount_total / 100 : Number(payment.amount));
           }
        } else {
           const pi = await this.paymentGatewayService.retrievePaymentIntent(payment.stripePaymentIntentId);
           if (pi.status === 'succeeded') {
             await this.confirmStripePayment(payment.stripePaymentIntentId, 'SUCCESS', pi.amount_received ? pi.amount_received / 100 : Number(payment.amount));
           } else if (pi.status === 'canceled') {
             await this.confirmStripePayment(payment.stripePaymentIntentId, 'FAIL', Number(payment.amount));
           }
        }
      }
      const updatedRes = await this.findOneMyReservation(id, user);
      
      return updatedRes.paymentSummary;
    } catch (e: any) {
      console.error('[RECONCILE ERROR]', e);
      throw new BadRequestException(e.message || 'Error en reconciliacion');
    }
  }

  async cancelAbandonedIntents() {
    // 30 mins limit for reservations without expiresAt
    const defaultExpirationTime = new Date(Date.now() - 30 * 60 * 1000);
    const now = new Date();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    
    // Solo lectura de pendientes
    const reservations = await queryRunner.manager.find(Reservation, {
      where: {
        status: ReservationStatus.PENDIENTE
      },
      relations: { sale: { payments: true } }
    });

    const abandoned = reservations.filter(r => {
      if (!r.sale || !r.sale.payments || r.sale.payments.length === 0) {
        return new Date(r.registrationDate) < defaultExpirationTime;
      }
      
      const hasApproved = r.sale.payments.some(p => p.status === PaymentStatus.APROBADO);
      if (hasApproved) return false;

      // Un pago pendiente activo que aún NO expira evita que se cancele la reserva
      const hasActivePending = r.sale.payments.some(p => 
        p.status === PaymentStatus.PENDIENTE && 
        (!p.expiresAt || new Date(p.expiresAt) > now)
      );
      
      if (hasActivePending) return false;

      // Si todos los pendientes están expirados, o no tiene activos, se abandona
      return true;
    });

    let cancelledCount = 0;
    for (const res of abandoned) {
       await queryRunner.startTransaction();
       try {
         // Lock the reservation without relations first
         const lockedRes = await queryRunner.manager.findOne(Reservation, {
           where: { id: res.id },
           lock: { mode: 'pessimistic_write' }
         });
         
         const reservation = lockedRes ? await queryRunner.manager.findOne(Reservation, {
           where: { id: res.id },
           relations: { items: true, sale: { payments: true } }
         }) : null;
         
         if (reservation && reservation.status === ReservationStatus.PENDIENTE) {
           reservation.status = ReservationStatus.CANCELADA;
           
           if (reservation.sale) {
             reservation.sale.status = SaleStatus.PENDIENTE; // o CANCELADA si existe el estado
             await queryRunner.manager.save(reservation.sale);
             
             if (reservation.sale.payments?.length) {
                for (const p of reservation.sale.payments) {
                  if (p.status === PaymentStatus.PENDIENTE) {
                    p.status = PaymentStatus.RECHAZADO;
                    await queryRunner.manager.save(p);
                  }
                }
             }
           }
           
           for (const item of reservation.items) {
             const inventory = await queryRunner.manager.findOne(Inventory, {
                where: { branchId: reservation.branchId, variantId: item.variantId },
                lock: { mode: 'pessimistic_write' }
             });
             if (inventory) {
               inventory.reserved -= item.quantity;
               await queryRunner.manager.save(inventory);
               
               const movement = queryRunner.manager.create(InventoryMovement, {
                  inventoryId: inventory.id,
                  type: MovementType.LIBERACION_RESERVA,
                  quantity: item.quantity,
                  userId: 1, // Admin o System user
                  notes: `Reserva expirada #${reservation.id} - Liberacion`
               });
               await queryRunner.manager.save(movement);
             }
           }
           await queryRunner.manager.save(reservation);
           await queryRunner.commitTransaction();
           cancelledCount++;
         } else {
           await queryRunner.rollbackTransaction();
         }
       } catch (err) {
         await queryRunner.rollbackTransaction();
       }
    }
    
    await queryRunner.release();
    return { cancelledCount };
  }

  async findMyReservations(user: any) {
    if (!user.roles?.includes('CLIENTE')) {
      throw new ForbiddenException('Endpoint exclusivo para clientes');
    }
    const client = await this.clientRepository.findOne({ where: { userId: user.sub } });
    if (!client) throw new UnauthorizedException('Perfil de cliente no encontrado');

    const reservations = await this.reservationRepository.find({
      where: { clientId: client.id },
      relations: {
        branch: true,
        client: true,
        items: {
          variant: {
            product: true,
            size: true,
            color: true
          }
        },
        sale: {
          payments: true
        }
      },
      order: { id: 'DESC' }
    });
    return reservations.map(r => ({ ...r, paymentSummary: this.calculatePaymentSummary(r) }));
  }

  async findOneMyReservation(id: number, user: any) {
    if (!user.roles?.includes('CLIENTE')) {
      throw new ForbiddenException('Endpoint exclusivo para clientes');
    }
    const client = await this.clientRepository.findOne({ where: { userId: user.sub } });
    if (!client) throw new UnauthorizedException('Perfil de cliente no encontrado');

    const reservation = await this.reservationRepository.findOne({
      where: { id, clientId: client.id },
      relations: {
        branch: true,
        client: true,
        items: {
          variant: {
            product: true,
            size: true,
            color: true
          }
        },
        sale: {
          payments: true
        }
      }
    });

    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    return { ...reservation, paymentSummary: this.calculatePaymentSummary(reservation) };
  }

  async findAll(user: any, deliveryQueue: boolean = false) {
    const isAdmin = user.roles?.includes('ADMIN');
    const isEncargado = user.roles?.includes('ENCARGADO');
    const isCajero = user.roles?.includes('CAJERO');
    
    if (!isAdmin && !isEncargado && !isCajero) {
      throw new ForbiddenException('No tiene permisos internos para listar reservas');
    }

    let whereClause: any = {};

    if (isEncargado || isCajero) {
      whereClause.branchId = user.branchId;
    }

    if (deliveryQueue) {
      whereClause.status = In([
        ReservationStatus.CONFIRMADA,
        ReservationStatus.PREPARANDO,
        ReservationStatus.LISTA
      ]);
    }

    const reservations = await this.reservationRepository.find({
      where: whereClause,
      relations: {
        branch: true,
        client: true,
        items: {
          variant: {
            product: true,
            size: true,
            color: true
          }
        },
        sale: {
          payments: true
        }
      },
      order: { id: 'DESC' }
    });
    return reservations.map(r => ({ ...r, paymentSummary: this.calculatePaymentSummary(r) }));
  }

  async findOne(id: number, user: any) {
    const isAdmin = user.roles?.includes('ADMIN');
    const isEncargado = user.roles?.includes('ENCARGADO');
    const isCajero = user.roles?.includes('CAJERO');
    
    if (!isAdmin && !isEncargado && !isCajero) {
      throw new ForbiddenException('No tiene permisos internos para ver esta reserva');
    }

    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: {
        branch: true,
        client: true,
        items: {
          variant: {
            product: true,
            size: true,
            color: true
          }
        },
        sale: {
          payments: true
        }
      }
    });

    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    if (!isAdmin && (isEncargado || isCajero) && reservation.branchId !== user.branchId) {
      throw new UnauthorizedException('No tiene permisos para ver reservas de otras sucursales');
    }

    return { ...reservation, paymentSummary: this.calculatePaymentSummary(reservation) };
  }

  async update(id: number, updateReservationDto: UpdateReservationDto, user: any) {
    const reservation = await this.findOne(id, user); // checks authorization

    const isAdmin = user.roles?.includes('ADMIN');
    const isEncargado = user.roles?.includes('ENCARGADO');
    const isCajero = user.roles?.includes('CAJERO');
    
    if (isCajero) {
      throw new UnauthorizedException('Cajeros no pueden modificar estados de reservas');
    }

    const isClient = !isAdmin && !isEncargado && !isCajero;

    // Solo un cliente o administrador/encargado puede cancelar
    if (updateReservationDto.status === ReservationStatus.CANCELADA) {
      if (reservation.status === ReservationStatus.CANCELADA || reservation.status === ReservationStatus.ATENDIDA) {
        throw new BadRequestException('No se puede cancelar en este estado');
      }
      return this.cancelReservation(id, user);
    }

    // Cambios de estado positivos
    if (isClient) {
      throw new UnauthorizedException('Clientes no pueden avanzar estados de reservas');
    }

    const flow = [
      ReservationStatus.PENDIENTE,
      ReservationStatus.CONFIRMADA,
      ReservationStatus.PREPARANDO,
      ReservationStatus.LISTA,
      ReservationStatus.ATENDIDA
    ];

    const currentIndex = flow.indexOf(reservation.status);
    const targetIndex = flow.indexOf(updateReservationDto.status);

    if (targetIndex === -1 || currentIndex === -1) {
      throw new BadRequestException('Estado invlido');
    }

    // Permitir avanzar pero NO retroceder arbitrariamente
    if (targetIndex <= currentIndex) {
      throw new BadRequestException('Solo puede avanzar el estado');
    }

    // Si es ATENDIDA, liberar inventario sin deducir stock (hasta las ventas)
    if (updateReservationDto.status === ReservationStatus.ATENDIDA) {
      await this.markAsAttended(reservation, user);
    }

    reservation.status = updateReservationDto.status;
    const saved = await this.reservationRepository.save(reservation);

    this.notificationsService.notifyReservationStatusUpdated(
      saved.branchId,
      saved,
      saved.client.userId,
      updateReservationDto.status
    ).catch(e => console.error('Error notifying status update', e));

    if (updateReservationDto.status === ReservationStatus.LISTA) {
      this.appGateway.server.to(`branch:${saved.branchId}`).emit('reservation.ready', {
        reservationId: saved.id,
        message: 'Nueva reserva lista para entregar/cobrar'
      });
    }

    return saved;
  }

  async cancelMyReservation(id: number, user: any) {
    const reservation = await this.findOneMyReservation(id, user);
    if (reservation.status === ReservationStatus.CANCELADA || reservation.status === ReservationStatus.ATENDIDA) {
      throw new BadRequestException('No se puede cancelar en este estado');
    }
    return this.cancelReservation(id, user);
  }

  private async cancelReservation(id: number, user: any) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id },
        relations: { items: true }
      });
      if (!reservation) throw new NotFoundException();

      for (const item of reservation.items) {
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { branchId: reservation.branchId, variantId: item.variantId },
          lock: { mode: 'pessimistic_write' }
        });

        if (inventory) {
          inventory.reserved = Math.max(0, inventory.reserved - item.quantity);
          await queryRunner.manager.save(inventory);

          const movement = queryRunner.manager.create(InventoryMovement, {
            inventoryId: inventory.id,
            type: MovementType.LIBERACION_RESERVA,
            quantity: item.quantity,
            userId: user.sub,
            notes: `Cancelacin Reserva #${reservation.id}`
          });
          await queryRunner.manager.save(movement);
        }
      }

      reservation.status = ReservationStatus.CANCELADA;
      const saved = await queryRunner.manager.save(reservation);

      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private async markAsAttended(reservation: Reservation, user: any) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get fresh reservation items in transaction
      const freshRes = await queryRunner.manager.findOne(Reservation, {
        where: { id: reservation.id },
        relations: { items: true }
      });
      if (!freshRes) throw new NotFoundException();

      for (const item of freshRes.items) {
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { branchId: freshRes.branchId, variantId: item.variantId },
          lock: { mode: 'pessimistic_write' }
        });

        if (inventory) {
          inventory.reserved = Math.max(0, inventory.reserved - item.quantity);
          // OJO: No se reduce el stock aqu, solo se libera reserved. La VENTA har la reduccin del stock.
          await queryRunner.manager.save(inventory);

          const movement = queryRunner.manager.create(InventoryMovement, {
            inventoryId: inventory.id,
            type: MovementType.LIBERACION_RESERVA,
            quantity: item.quantity,
            userId: user.sub,
            notes: `Atencin Reserva #${freshRes.id}`
          });
          await queryRunner.manager.save(movement);
        }
      }
      
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: number) {
    throw new BadRequestException('No se puede eliminar fsicamente una reserva. Use status = CANCELADA');
  }



  async deliver(id: number, user: any) {
    if (!user.roles?.includes('CAJERO')) {
      throw new ForbiddenException('Endpoint exclusivo para cajeros');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id, branchId: user.branchId },
        relations: { sale: { payments: true }, client: true }
      });

      if (!reservation) {
        throw new NotFoundException('Reserva no encontrada o no pertenece a su sucursal');
      }

      if (reservation.status === ReservationStatus.ATENDIDA) {
        throw new ConflictException('La reserva ya ha sido entregada');
      }

      if (reservation.status !== ReservationStatus.LISTA) {
        throw new BadRequestException('La reserva debe estar en estado LISTA para ser entregada');
      }

      if (!reservation.sale) {
        throw new BadRequestException('La reserva no tiene una venta asociada');
      }

      const hasApprovedPayment = reservation.sale.payments?.some(p => p.status === PaymentStatus.APROBADO);
      if (!hasApprovedPayment) {
        throw new BadRequestException('La venta no tiene un pago aprobado');
      }

      reservation.status = ReservationStatus.ATENDIDA;
      await queryRunner.manager.save(Reservation, reservation);

      await queryRunner.commitTransaction();

      // Cajero info
      const cashierName = user.name ? `${user.name} ${user.lastName || ''}`.trim() : 'Cajero';

      // Notifications
      this.notificationsService.notifyReservationDelivered(
        reservation.branchId,
        reservation,
        cashierName,
        reservation.client.userId
      ).catch(e => console.error('Failed to notify reservation delivered', e));

      // WS Event
      this.appGateway.notifyReservationAttended({
        reservationId: reservation.id,
        branchId: reservation.branchId,
        status: "ATENDIDA",
        cashierName
      });

      return { success: true, message: 'Reserva entregada con éxito', reservation };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async payAndDeliver(id: number, method: string, user: any) {
    if (!user.roles?.includes('CAJERO')) {
      throw new ForbiddenException('Endpoint exclusivo para cajeros');
    }

    if (!Object.values(PaymentMethod).includes(method as PaymentMethod) || method === PaymentMethod.TARJETA) {
      throw new BadRequestException('Método de pago inválido o no soportado en caja');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock reservation without relations first to avoid Postgres FOR UPDATE outer join error
      const lockedReservation = await queryRunner.manager.findOne(Reservation, {
        where: { id, branchId: user.branchId },
        lock: { mode: 'pessimistic_write' }
      });

      const reservation = lockedReservation ? await queryRunner.manager.findOne(Reservation, {
        where: { id },
        relations: { items: { variant: { product: true } }, client: true, sale: { payments: true } }
      }) : null;

      if (!reservation) {
        throw new NotFoundException('Reserva no encontrada o no pertenece a su sucursal');
      }

      if (reservation.status === ReservationStatus.ATENDIDA) {
        throw new ConflictException('La reserva ya ha sido entregada');
      }

      if (reservation.status !== ReservationStatus.LISTA) {
        throw new BadRequestException('La reserva debe estar en estado LISTA para ser cobrada y entregada');
      }

      let remainingAmount = 0;
      let existingSale = reservation.sale;
      let isPartialPayment = false;

      if (existingSale) {
        const summary = this.calculatePaymentSummary(reservation);
        
        if (summary.paymentState === 'PAGADO') {
          throw new ConflictException('La reserva ya está totalmente pagada, use el botón de Validar Entrega');
        }
        
        if (summary.paymentState === 'PARCIAL') {
          isPartialPayment = true;
          remainingAmount = summary.remainingAmount;
        }
      }

      let total = 0;
      const saleItemsToSave = [];
      const inventoriesToUpdate = [];
      const inventoryMovementsToSave = [];

      for (const item of reservation.items) {
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { branchId: reservation.branchId, variantId: item.variantId },
          lock: { mode: 'pessimistic_write' }
        });

        if (!inventory) {
          throw new NotFoundException(`Inventario no encontrado para la variante ${item.variantId}`);
        }

        if (inventory.stock < item.quantity) {
          throw new ConflictException(`Stock insuficiente para la variante ${item.variantId}`);
        }

        if (inventory.reserved < item.quantity) {
          throw new ConflictException(`Cantidad reservada inconsistente para la variante ${item.variantId}`);
        }

        const unitPriceNum = Number(item.variant.product.price);
        const subtotalNum = Number((unitPriceNum * item.quantity).toFixed(2));
        total += subtotalNum;

        if (!existingSale) {
          const saleItem = queryRunner.manager.create(SaleItem, {
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: unitPriceNum,
            subtotal: subtotalNum,
            saleId: 0
          });
          saleItemsToSave.push(saleItem);
        }

        inventory.stock -= item.quantity;
        inventory.reserved -= item.quantity;
        inventoriesToUpdate.push(inventory);

        const movement = queryRunner.manager.create(InventoryMovement, {
          inventoryId: inventory.id,
          type: MovementType.VENTA,
          quantity: item.quantity,
          userId: user.sub,
          notes: `Venta por reserva #${reservation.id} en caja`
        });
        inventoryMovementsToSave.push(movement);
      }

      total = Number(total.toFixed(2));

      if (!existingSale) {
        remainingAmount = total;
        existingSale = queryRunner.manager.create(Sale, {
          channel: SaleChannel.POS,
          status: SaleStatus.COMPLETADA,
          branchId: reservation.branchId,
          clientId: reservation.client.id,
          reservationId: reservation.id,
          subtotal: total,
          total: total,
          userId: user.sub,
        });

        const savedSale = await queryRunner.manager.save(Sale, existingSale);
        existingSale.id = savedSale.id;

        for (const si of saleItemsToSave) {
          si.saleId = existingSale.id;
          await queryRunner.manager.save(SaleItem, si);
        }
      } else {
        existingSale.status = SaleStatus.COMPLETADA;
        await queryRunner.manager.save(Sale, existingSale);
      }

      const payment = queryRunner.manager.create(Payment, {
        saleId: existingSale.id,
        amount: remainingAmount,
        method: method as PaymentMethod,
        status: PaymentStatus.APROBADO
      });
      await queryRunner.manager.save(Payment, payment);

      for (const inv of inventoriesToUpdate) {
        await queryRunner.manager.save(Inventory, inv);
      }

      for (const mov of inventoryMovementsToSave) {
        await queryRunner.manager.save(InventoryMovement, mov);
      }

      reservation.status = ReservationStatus.ATENDIDA;
      await queryRunner.manager.save(Reservation, reservation);

      await queryRunner.commitTransaction();

      // Cajero info
      const cashierName = user.name ? `${user.name} ${user.lastName || ''}`.trim() : 'Cajero';

      // Notifications
      this.notificationsService.notifyReservationDelivered(
        reservation.branchId,
        reservation,
        cashierName,
        reservation.client.userId
      ).catch(e => console.error('Failed to notify reservation delivered', e));

      // WS Event
      this.appGateway.notifyReservationAttended({
        reservationId: reservation.id,
        branchId: reservation.branchId,
        status: "ATENDIDA",
        cashierName
      });

      return { success: true, message: 'Reserva cobrada y entregada con éxito', reservation };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
