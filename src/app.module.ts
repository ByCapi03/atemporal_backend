import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { BranchesModule } from './modules/branches/branches.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { SalesModule } from './modules/sales/sales.module';
import { IntelligenceModule } from './modules/intelligence/intelligence.module';
import { NotificationsModule } from './integrations/notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    CatalogModule,
    BranchesModule,
    InventoryModule,
    ReservationsModule,
    SalesModule,
    IntelligenceModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
