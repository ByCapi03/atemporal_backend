import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import {
  CreateProductDto, UpdateProductDto,
  CreateVariantDto, UpdateVariantDto,
  CreateCategoryDto, UpdateCategoryDto,
  CreateSizeDto, UpdateSizeDto,
  CreateColorDto, UpdateColorDto
} from './catalog.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { UploadedFile, UseInterceptors, UseGuards } from '@nestjs/common';

@Controller()
@UseGuards(AuthGuard)
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
}
