import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Sale } from '../sales/sale.entity';
import { Reservation } from '../reservations/reservation.entity';
import { Inventory } from '../inventory/inventory.entity';
import { SaleItem } from '../sales/sale-item.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, Reservation, Inventory, SaleItem]),
    AuthModule
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService]
})
export class DashboardModule {}
