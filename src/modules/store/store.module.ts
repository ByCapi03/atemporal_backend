import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { Product } from '../catalog/product.entity';
import { Variant } from '../catalog/variant.entity';
import { Inventory } from '../inventory/inventory.entity';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Variant, Inventory]), CatalogModule],
  controllers: [StoreController],
  providers: [StoreService],
})
export class StoreModule {}
