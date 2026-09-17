import { Module } from '@nestjs/common';
import { CartController } from './controllers/cart.controller';
import { OrdersController } from './controllers/orders.controller';
import { PaymentsController } from './controllers/payments.controller';
import { ReturnsController } from './controllers/returns.controller';
import { SalesController } from './controllers/sales.controller';
import { CartService } from './services/cart.service';
import { OrdersService } from './services/orders.service';
import { PaymentsService } from './services/payments.service';
import { ReturnsService } from './services/returns.service';
import { SalesService } from './services/sales.service';

@Module({
  controllers: [CartController, OrdersController, PaymentsController, ReturnsController, SalesController],
  providers: [CartService, OrdersService, PaymentsService, ReturnsService, SalesService],
})
export class SalesModule {}
