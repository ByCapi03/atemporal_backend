import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservationsController, StripeWebhookController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

import { Reservation } from './reservation.entity';
import { ReservationItem } from './reservation-item.entity';
import { Client } from '../clients/client.entity';
import { Inventory } from '../inventory/inventory.entity';
import { InventoryMovement } from '../inventory/inventory-movement.entity';
import { Branch } from '../branches/branch.entity';
import { Variant } from '../catalog/variant.entity';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SalesModule } from '../sales/sales.module';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Reservation, 
      ReservationItem, 
      Client, 
      Inventory, 
      InventoryMovement,
      Branch,
      Variant
    ]),
    AuthModule,
    NotificationsModule,
    SalesModule,
    CatalogModule
  ],
  controllers: [ReservationsController, StripeWebhookController],
  providers: [ReservationsService],
  exports: [ReservationsService]
})
export class ReservationsModule {}
