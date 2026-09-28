import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import {
  CreateProductDto, UpdateProductDto,
  CreateVariantDto, UpdateVariantDto,
  CreateCategoryDto, UpdateCategoryDto,
  CreateSizeDto, UpdateSizeDto,
  CreateColorDto, UpdateColorDto,
  CreateSeasonDto, UpdateSeasonDto,
  CreateCollectionDto, UpdateCollectionDto,
  CreatePromotionDto, UpdatePromotionDto
} from './catalog.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { UploadedFile, UseInterceptors, UseGuards } from '@nestjs/common';

import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('products')
  createProduct(@Body() createProductDto: CreateProductDto) { return this.catalogService.createProduct(createProductDto); }
  @Get('products')
  findAllProducts() { return this.catalogService.findAllProducts(); }
  @Get('products/:id')
  findOneProduct(@Param('id') id: string) { return this.catalogService.findOneProduct(+id); }
  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) { return this.catalogService.updateProduct(+id, updateProductDto); }
  @Delete('products/:id')
  removeProduct(@Param('id') id: string) { return this.catalogService.removeProduct(+id); }

  @Post('products/:id/image')
  @UseInterceptors(FileInterceptor('image'))
  uploadProductImage(
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    return this.catalogService.uploadProductImage(+id, file);
  }

  @Post('products/:id/ar-image')
  @UseInterceptors(FileInterceptor('image'))
  uploadProductArImage(
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    return this.catalogService.uploadProductArImage(+id, file);
  }

  @Post('variants')
  createVariant(@Body() createVariantDto: CreateVariantDto) { return this.catalogService.createVariant(createVariantDto); }
  @Get('variants')
  findAllVariants() { return this.catalogService.findAllVariants(); }
  @Get('variants/:id')
  findOneVariant(@Param('id') id: string) { return this.catalogService.findOneVariant(+id); }
  @Patch('variants/:id')
  updateVariant(@Param('id') id: string, @Body() updateVariantDto: UpdateVariantDto) { return this.catalogService.updateVariant(+id, updateVariantDto); }
  @Delete('variants/:id')
  removeVariant(@Param('id') id: string) { return this.catalogService.removeVariant(+id); }

  @Post('categories')
  createCategory(@Body() createCategoryDto: CreateCategoryDto) { return this.catalogService.createCategory(createCategoryDto); }
  @Get('categories')
  findAllCategories() { return this.catalogService.findAllCategories(); }
  @Get('categories/:id')
  findOneCategory(@Param('id') id: string) { return this.catalogService.findOneCategory(+id); }
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) { return this.catalogService.updateCategory(+id, updateCategoryDto); }
  @Delete('categories/:id')
  removeCategory(@Param('id') id: string) { return this.catalogService.removeCategory(+id); }

  @Post('sizes')
  createSize(@Body() createSizeDto: CreateSizeDto) { return this.catalogService.createSize(createSizeDto); }
  @Get('sizes')
  findAllSizes() { return this.catalogService.findAllSizes(); }
  @Get('sizes/:id')
  findOneSize(@Param('id') id: string) { return this.catalogService.findOneSize(+id); }
  @Patch('sizes/:id')
  updateSize(@Param('id') id: string, @Body() updateSizeDto: UpdateSizeDto) { return this.catalogService.updateSize(+id, updateSizeDto); }
  @Delete('sizes/:id')
  removeSize(@Param('id') id: string) { return this.catalogService.removeSize(+id); }

  @Post('colors')
  createColor(@Body() createColorDto: CreateColorDto) { return this.catalogService.createColor(createColorDto); }
  @Get('colors')
  findAllColors() { return this.catalogService.findAllColors(); }
  @Get('colors/:id')
  findOneColor(@Param('id') id: string) { return this.catalogService.findOneColor(+id); }
  @Patch('colors/:id')
  updateColor(@Param('id') id: string, @Body() updateColorDto: UpdateColorDto) { return this.catalogService.updateColor(+id, updateColorDto); }
  @Delete('colors/:id')
  removeColor(@Param('id') id: string) { return this.catalogService.removeColor(+id); }

  @Post('seasons')
  @Roles('ADMIN')
  createSeason(@Body() createSeasonDto: CreateSeasonDto) { return this.catalogService.createSeason(createSeasonDto); }
  
  @Get('seasons')
  @Roles('ADMIN', 'ENCARGADO')
  findAllSeasons() { return this.catalogService.findAllSeasons(); }
  
  @Get('seasons/:id')
  @Roles('ADMIN', 'ENCARGADO')
  findOneSeason(@Param('id') id: string) { return this.catalogService.findOneSeason(+id); }
  
  @Patch('seasons/:id')
  @Roles('ADMIN')
  updateSeason(@Param('id') id: string, @Body() updateSeasonDto: UpdateSeasonDto) { return this.catalogService.updateSeason(+id, updateSeasonDto); }
  
  @Delete('seasons/:id')
  @Roles('ADMIN')
  removeSeason(@Param('id') id: string) { return this.catalogService.removeSeason(+id); }

  @Post('collections')
  @Roles('ADMIN')
  createCollection(@Body() createCollectionDto: CreateCollectionDto) { return this.catalogService.createCollection(createCollectionDto); }
  
  @Get('collections')
  @Roles('ADMIN', 'ENCARGADO')
  findAllCollections() { return this.catalogService.findAllCollections(); }
  
  @Get('collections/:id')
  @Roles('ADMIN', 'ENCARGADO')
  findOneCollection(@Param('id') id: string) { return this.catalogService.findOneCollection(+id); }
  
  @Patch('collections/:id')
  @Roles('ADMIN')
  updateCollection(@Param('id') id: string, @Body() updateCollectionDto: UpdateCollectionDto) { return this.catalogService.updateCollection(+id, updateCollectionDto); }
  
  @Delete('collections/:id')
  @Roles('ADMIN')
  removeCollection(@Param('id') id: string) { return this.catalogService.removeCollection(+id); }

  @Post('promotions')
  @Roles('ADMIN')
  createPromotion(@Body() createPromotionDto: CreatePromotionDto) { return this.catalogService.createPromotion(createPromotionDto); }
  
  @Get('promotions')
  @Roles('ADMIN', 'ENCARGADO')
  findAllPromotions() { return this.catalogService.findAllPromotions(); }
  
  @Get('promotions/:id')
  @Roles('ADMIN', 'ENCARGADO')
  findOnePromotion(@Param('id') id: string) { return this.catalogService.findOnePromotion(+id); }
  
  @Patch('promotions/:id')
  @Roles('ADMIN')
  updatePromotion(@Param('id') id: string, @Body() updatePromotionDto: UpdatePromotionDto) { return this.catalogService.updatePromotion(+id, updatePromotionDto); }
  
  @Delete('promotions/:id')
  @Roles('ADMIN')
  removePromotion(@Param('id') id: string) { return this.catalogService.removePromotion(+id); }
}
