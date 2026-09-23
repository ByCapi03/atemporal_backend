import { Controller, Get, Param } from '@nestjs/common';
import { StoreService } from './store.service';

@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get('products')
  getPublicProducts() {
    return this.storeService.getPublicProducts();
  }

  @Get('products/:id')
  getPublicProductDetail(@Param('id') id: string) {
    return this.storeService.getPublicProductDetail(+id);
  }

  @Get('availability/:variantId')
  getAvailability(@Param('variantId') variantId: string) {
    return this.storeService.getAvailability(+variantId);
  }
}
