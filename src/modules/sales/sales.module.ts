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

import { CashSessionsController } from './cash-sessions.controller';
import { CashSessionsService } from './cash-sessions.service';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem, Payment, CashSession, Branch, User, Inventory, Product, Variant, Client]),
    AuthModule
  ],
  controllers: [SalesController, CashSessionsController, PosController],
  providers: [SalesService, CashSessionsService, PosService],
  exports: [SalesService, CashSessionsService, PosService]
})
export class SalesModule {}
