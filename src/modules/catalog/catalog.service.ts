import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloudinaryService } from '../../common/cloudinary.service';

import {
  CreateProductDto, UpdateProductDto,
  CreateVariantDto, UpdateVariantDto,
  CreateCategoryDto, UpdateCategoryDto,
  CreateSizeDto, UpdateSizeDto,
  CreateColorDto, UpdateColorDto
} from './catalog.dto';

import { Category } from './category.entity';
import { Size } from './size.entity';
import { Color } from './color.entity';
import { Product } from './product.entity';
import { Variant } from './variant.entity';
import { Supplier } from '../inventory/supplier.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Category) private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Size) private readonly sizeRepository: Repository<Size>,
    @InjectRepository(Color) private readonly colorRepository: Repository<Color>,
    @InjectRepository(Product) private readonly productRepository: Repository<Product>,
    @InjectRepository(Variant) private readonly variantRepository: Repository<Variant>,
    private cloudinaryService: CloudinaryService
  ) {}

  // --- CATEGORIES ---
  async createCategory(createCategoryDto: CreateCategoryDto) {
    const existing = await this.categoryRepository.findOneBy({ name: createCategoryDto.name });
    if (existing) throw new ConflictException(`La categora ${createCategoryDto.name} ya existe`);
    const category = this.categoryRepository.create(createCategoryDto);
    return this.categoryRepository.save(category);
  }
  async findAllCategories() {
    return this.categoryRepository.find({ order: { id: 'ASC' } });
  }
  async findOneCategory(id: number) {
    const category = await this.categoryRepository.findOneBy({ id });
    if (!category) throw new NotFoundException(`Categora #${id} no encontrada`);
    return category;
  }
  async updateCategory(id: number, updateCategoryDto: UpdateCategoryDto) {
    const category = await this.findOneCategory(id);
    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      const existing = await this.categoryRepository.findOneBy({ name: updateCategoryDto.name });
      if (existing) throw new ConflictException(`La categora ${updateCategoryDto.name} ya existe`);
    }
    Object.assign(category, updateCategoryDto);
    return this.categoryRepository.save(category);
  }
  async removeCategory(id: number) {
    const category = await this.findOneCategory(id);
    category.active = false;
    await this.categoryRepository.save(category);
    return { success: true, message: `Categora ${id} desactivada` };
  }

  // --- SIZES ---
  async createSize(createSizeDto: CreateSizeDto) {
    const existing = await this.sizeRepository.findOneBy({ name: createSizeDto.name });
    if (existing) throw new ConflictException(`La talla ${createSizeDto.name} ya existe`);
    const size = this.sizeRepository.create(createSizeDto);
    return this.sizeRepository.save(size);
  }
  async findAllSizes() {
    return this.sizeRepository.find({ order: { id: 'ASC' } });
  }
  async findOneSize(id: number) {
    const size = await this.sizeRepository.findOneBy({ id });
    if (!size) throw new NotFoundException(`Talla #${id} no encontrada`);
    return size;
  }
  async updateSize(id: number, updateSizeDto: UpdateSizeDto) {
    const size = await this.findOneSize(id);
    if (updateSizeDto.name && updateSizeDto.name !== size.name) {
      const existing = await this.sizeRepository.findOneBy({ name: updateSizeDto.name });
      if (existing) throw new ConflictException(`La talla ${updateSizeDto.name} ya existe`);
    }
    Object.assign(size, updateSizeDto);
    return this.sizeRepository.save(size);
  }
  async removeSize(id: number) {
    const size = await this.findOneSize(id);
    size.active = false;
    await this.sizeRepository.save(size);
    return { success: true, message: `Talla ${id} desactivada` };
  }

  // --- COLORS ---
  async createColor(createColorDto: CreateColorDto) {
    const existing = await this.colorRepository.findOneBy({ name: createColorDto.name });
    if (existing) throw new ConflictException(`El color ${createColorDto.name} ya existe`);
    const color = this.colorRepository.create(createColorDto);
    return this.colorRepository.save(color);
  }
  async findAllColors() {
    return this.colorRepository.find({ order: { id: 'ASC' } });
  }
  async findOneColor(id: number) {
    const color = await this.colorRepository.findOneBy({ id });
    if (!color) throw new NotFoundException(`Color #${id} no encontrado`);
    return color;
  }
  async updateColor(id: number, updateColorDto: UpdateColorDto) {
    const color = await this.findOneColor(id);
    if (updateColorDto.name && updateColorDto.name !== color.name) {
      const existing = await this.colorRepository.findOneBy({ name: updateColorDto.name });
      if (existing) throw new ConflictException(`El color ${updateColorDto.name} ya existe`);
    }
    Object.assign(color, updateColorDto);
    return this.colorRepository.save(color);
  }
  async removeColor(id: number) {
    const color = await this.findOneColor(id);
    color.active = false;
    await this.colorRepository.save(color);
    return { success: true, message: `Color ${id} desactivado` };
  }

  // --- PRODUCTS ---
  async createProduct(createProductDto: CreateProductDto) {
    if (createProductDto.arEnabled && !createProductDto.arType) {
      throw new BadRequestException('El tipo de prenda AR (arType) es obligatorio si AR está habilitado');
    }

    const category = await this.categoryRepository.findOneBy({ id: createProductDto.categoryId });
    if (!category) throw new NotFoundException(`Categora #${createProductDto.categoryId} no encontrada`);

    const product = this.productRepository.create(createProductDto);
    return this.productRepository.save(product);
  }
  async findAllProducts() {
    return this.productRepository.find({
      relations: { category: true, variants: true },
      order: { id: 'ASC' }
    });
  }
  async findOneProduct(id: number) {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: { category: true, variants: true }
    });
    if (!product) throw new NotFoundException(`Producto #${id} no encontrado`);
    return product;
  }
  async updateProduct(id: number, updateProductDto: UpdateProductDto) {
    const product = await this.findOneProduct(id);

    const isArEnabled = updateProductDto.arEnabled !== undefined ? updateProductDto.arEnabled : product.arEnabled;
    const currentArType = updateProductDto.arType !== undefined ? updateProductDto.arType : product.arType;
    if (isArEnabled && !currentArType) {
      throw new BadRequestException('El tipo de prenda AR (arType) es obligatorio si AR está habilitado');
    }

    if (updateProductDto.categoryId) {
      const category = await this.categoryRepository.findOneBy({ id: updateProductDto.categoryId });
      if (!category) throw new NotFoundException(`Categora #${updateProductDto.categoryId} no encontrada`);
    }
    Object.assign(product, updateProductDto);
    return this.productRepository.save(product);
  }

  async uploadProductImage(id: number, file: any) {
    const product = await this.findOneProduct(id);

    // Upload to Cloudinary
    const uploadResult = await this.cloudinaryService.uploadImage(file);

    // Si ya tena una imagen, borrar la anterior en Cloudinary
    if (product.imagePublicId) {
      await this.cloudinaryService.deleteImage(product.imagePublicId);
    }

    product.imageUrl = uploadResult.secure_url;
    product.imagePublicId = uploadResult.public_id;

    return this.productRepository.save(product);
  }

  async uploadProductArImage(id: number, file: any) {
    const product = await this.findOneProduct(id);

    // Upload to Cloudinary
    const uploadResult = await this.cloudinaryService.uploadImage(file);

    // Si ya tenia una imagen AR, borrar la anterior en Cloudinary
    if (product.arImagePublicId) {
      await this.cloudinaryService.deleteImage(product.arImagePublicId);
    }

    product.arImageUrl = uploadResult.secure_url;
    product.arImagePublicId = uploadResult.public_id;

    return this.productRepository.save(product);
  }

  async removeProduct(id: number) {
    const product = await this.findOneProduct(id);
    product.active = false;
    await this.productRepository.save(product);
    return { success: true, message: `Producto ${id} desactivado` };
  }

  // --- VARIANTS ---
  async createVariant(createVariantDto: CreateVariantDto) {
    const existing = await this.variantRepository.findOneBy({ sku: createVariantDto.sku });
    if (existing) throw new ConflictException(`El SKU ${createVariantDto.sku} ya est en uso`);

    const product = await this.productRepository.findOneBy({ id: createVariantDto.productId });
    if (!product) throw new NotFoundException(`Producto #${createVariantDto.productId} no encontrado`);
    const size = await this.sizeRepository.findOneBy({ id: createVariantDto.sizeId });
    if (!size) throw new NotFoundException(`Talla #${createVariantDto.sizeId} no encontrada`);
    const color = await this.colorRepository.findOneBy({ id: createVariantDto.colorId });
    if (!color) throw new NotFoundException(`Color #${createVariantDto.colorId} no encontrado`);

    const variant = this.variantRepository.create(createVariantDto);
    return this.variantRepository.save(variant);
  }
  async findAllVariants() {
    return this.variantRepository.find({
      relations: { product: true, size: true, color: true },
      order: { id: 'ASC' }
    });
  }
  async findOneVariant(id: number) {
    const variant = await this.variantRepository.findOne({
      where: { id },
      relations: { product: true, size: true, color: true }
    });
    if (!variant) throw new NotFoundException(`Variante #${id} no encontrada`);
    return variant;
  }
  async updateVariant(id: number, updateVariantDto: UpdateVariantDto) {
    const variant = await this.findOneVariant(id);

    if (updateVariantDto.sku && updateVariantDto.sku !== variant.sku) {
      const existing = await this.variantRepository.findOneBy({ sku: updateVariantDto.sku });
      if (existing) throw new ConflictException(`El SKU ${updateVariantDto.sku} ya est en uso`);
    }

    if (updateVariantDto.productId) {
      const product = await this.productRepository.findOneBy({ id: updateVariantDto.productId });
      if (!product) throw new NotFoundException(`Producto #${updateVariantDto.productId} no encontrado`);
    }
    if (updateVariantDto.sizeId) {
      const size = await this.sizeRepository.findOneBy({ id: updateVariantDto.sizeId });
      if (!size) throw new NotFoundException(`Talla #${updateVariantDto.sizeId} no encontrada`);
    }
    if (updateVariantDto.colorId) {
      const color = await this.colorRepository.findOneBy({ id: updateVariantDto.colorId });
      if (!color) throw new NotFoundException(`Color #${updateVariantDto.colorId} no encontrado`);
    }

    Object.assign(variant, updateVariantDto);
    return this.variantRepository.save(variant);
  }
  async removeVariant(id: number) {
    const variant = await this.findOneVariant(id);
    variant.active = false;
    await this.variantRepository.save(variant);
    return { success: true, message: `Variante ${id} desactivada` };
  }
}
