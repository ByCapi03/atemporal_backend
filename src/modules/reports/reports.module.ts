import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Sale } from '../sales/sale.entity';
import { SaleItem } from '../sales/sale-item.entity';
import { Payment } from '../sales/payment.entity';
import { Inventory } from '../inventory/inventory.entity';
import { Reservation } from '../reservations/reservation.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem, Payment, Inventory, Reservation]),
    AuthModule
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService]
})
export class ReportsModule {}
