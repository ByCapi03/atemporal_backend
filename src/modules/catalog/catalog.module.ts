import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

import { Product } from './product.entity';
import { Variant } from './variant.entity';
import { Category } from './category.entity';
import { Size } from './size.entity';
import { Color } from './color.entity';
import { CloudinaryService } from '../../common/cloudinary.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Variant, Category, Size, Color]),
    ConfigModule,
    AuthModule
  ],
  controllers: [CatalogController],
  providers: [CatalogService, CloudinaryService],
  exports: [CatalogService]
})
export class CatalogModule {}
