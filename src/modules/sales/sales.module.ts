import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

import { Sale } from './sale.entity';
import { SaleItem } from './sale-item.entity';
import { Payment } from './payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem, Payment])
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService]
})
export class SalesModule {}
