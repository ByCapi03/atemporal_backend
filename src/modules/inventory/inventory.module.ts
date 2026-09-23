import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

import { Inventory } from './inventory.entity';
import { InventoryMovement } from './inventory-movement.entity';
import { Supplier } from './supplier.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inventory, InventoryMovement, Supplier])
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService]
})
export class InventoryModule {}
