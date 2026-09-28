/**
 * SALES MODULE
 * Configuración Central: Es el pegamento del módulo. Registra todos los controladores, 
 * servicios y entidades relacionados con ventas, y además importa los módulos de 
 * Inventory y Branches (porque una venta afecta stock y depende de una sucursal).
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

import { Sale } from './sale.entity';
import { SaleItem } from './sale-item.entity';
import { Payment } from './payment.entity';
import { CashSession } from './cash-session.entity';
import { Branch } from '../branches/branch.entity';
import { User } from '../auth/user.entity';
import { Inventory } from '../inventory/inventory.entity';
import { Product } from '../catalog/product.entity';
import { Variant } from '../catalog/variant.entity';
import { Client } from '../clients/client.entity';
import { InventoryMovement } from '../inventory/inventory-movement.entity';

import { CashSessionsService } from './cash-sessions.service';
import { CashSessionsController } from './cash-sessions.controller';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { PaymentGatewayService } from './payment-gateway.service';
import { PaymentGatewayController } from './payment-gateway.controller';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem, Payment, CashSession, Branch, User, Inventory, Product, Variant, Client]),
    AuthModule,
    CatalogModule
  ],
  controllers: [SalesController, CashSessionsController, PosController, PaymentGatewayController],
  providers: [SalesService, CashSessionsService, PosService, PaymentGatewayService],
  exports: [SalesService, CashSessionsService, PosService, PaymentGatewayService]
})
export class SalesModule {}
