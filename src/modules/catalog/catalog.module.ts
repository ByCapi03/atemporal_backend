import { Module } from '@nestjs/common';
import { CategoriesController } from './controllers/categories.controller';
import { CollectionsController } from './controllers/collections.controller';
import { ColorsController } from './controllers/colors.controller';
import { ProductsController } from './controllers/products.controller';
import { PromotionsController } from './controllers/promotions.controller';
import { SeasonsController } from './controllers/seasons.controller';
import { SizesController } from './controllers/sizes.controller';
import { VariantsController } from './controllers/variants.controller';
import { CategoriesService } from './services/categories.service';
import { CollectionsService } from './services/collections.service';
import { ColorsService } from './services/colors.service';
import { ProductsService } from './services/products.service';
import { PromotionsService } from './services/promotions.service';
import { SeasonsService } from './services/seasons.service';
import { SizesService } from './services/sizes.service';
import { VariantsService } from './services/variants.service';

@Module({
  controllers: [CategoriesController, CollectionsController, ColorsController, ProductsController, PromotionsController, SeasonsController, SizesController, VariantsController],
  providers: [CategoriesService, CollectionsService, ColorsService, ProductsService, PromotionsService, SeasonsService, SizesService, VariantsService],
})
export class CatalogModule {}
