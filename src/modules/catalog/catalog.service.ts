import { Injectable } from '@nestjs/common';
import {
  CreateProductDto, UpdateProductDto,
  CreateVariantDto, UpdateVariantDto,
  CreateCategoryDto, UpdateCategoryDto,
  CreateSizeDto, UpdateSizeDto,
  CreateColorDto, UpdateColorDto
} from './catalog.dto';

@Injectable()
export class CatalogService {
  createProduct(createProductDto: CreateProductDto) { return 'This action adds a new product'; }
  findAllProducts() { return `This action returns all products`; }
  findOneProduct(id: number) { return `This action returns a #${id} product`; }
  updateProduct(id: number, updateProductDto: UpdateProductDto) { return `This action updates a #${id} product`; }
  removeProduct(id: number) { return `This action removes a #${id} product`; }

  createVariant(createVariantDto: CreateVariantDto) { return 'This action adds a new variant'; }
  findAllVariants() { return `This action returns all variants`; }
  findOneVariant(id: number) { return `This action returns a #${id} variant`; }
  updateVariant(id: number, updateVariantDto: UpdateVariantDto) { return `This action updates a #${id} variant`; }
  removeVariant(id: number) { return `This action removes a #${id} variant`; }

  createCategory(createCategoryDto: CreateCategoryDto) { return 'This action adds a new category'; }
  findAllCategories() { return `This action returns all categories`; }
  findOneCategory(id: number) { return `This action returns a #${id} category`; }
  updateCategory(id: number, updateCategoryDto: UpdateCategoryDto) { return `This action updates a #${id} category`; }
  removeCategory(id: number) { return `This action removes a #${id} category`; }

  createSize(createSizeDto: CreateSizeDto) { return 'This action adds a new size'; }
  findAllSizes() { return `This action returns all sizes`; }
  findOneSize(id: number) { return `This action returns a #${id} size`; }
  updateSize(id: number, updateSizeDto: UpdateSizeDto) { return `This action updates a #${id} size`; }
  removeSize(id: number) { return `This action removes a #${id} size`; }

  createColor(createColorDto: CreateColorDto) { return 'This action adds a new color'; }
  findAllColors() { return `This action returns all colors`; }
  findOneColor(id: number) { return `This action returns a #${id} color`; }
  updateColor(id: number, updateColorDto: UpdateColorDto) { return `This action updates a #${id} color`; }
  removeColor(id: number) { return `This action removes a #${id} color`; }
}
