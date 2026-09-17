import { Module } from '@nestjs/common';
import { InventoryController } from './controllers/inventory.controller';
import { SuppliersController } from './controllers/suppliers.controller';
import { InventoryService } from './services/inventory.service';
import { SuppliersService } from './services/suppliers.service';

@Module({
  controllers: [InventoryController, SuppliersController],
  providers: [InventoryService, SuppliersService],
})
export class InventoryModule {}
