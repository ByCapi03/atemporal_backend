import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

import { Product } from './product.entity';
import { Variant } from './variant.entity';
import { Category } from './category.entity';
import { Size } from './size.entity';
import { Color } from './color.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Variant, Category, Size, Color])
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService]
})
export class CatalogModule {}
