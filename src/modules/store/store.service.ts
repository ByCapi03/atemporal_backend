import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Product } from '../catalog/product.entity';
import { Variant } from '../catalog/variant.entity';
import { Inventory } from '../inventory/inventory.entity';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Product) private productRepository: Repository<Product>,
    @InjectRepository(Variant) private variantRepository: Repository<Variant>,
    @InjectRepository(Inventory) private inventoryRepository: Repository<Inventory>,
  ) {}

  async getPublicProducts() {
    // Solo productos activos, con categoría activa y que tengan variantes activas
    const products = await this.productRepository.find({
      where: {
        active: true,
        category: { active: true },
        variants: { active: true }
      },
      relations: { category: true, variants: true }
    });

    return products.map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      categoryId: p.categoryId,
      categoryName: p.category.name,
      imageUrl: p.imageUrl,
      arEnabled: p.arEnabled,
      arImageUrl: p.arImageUrl ?? p.imageUrl,
      arType: p.arType
    }));
  }

  async getPublicProductDetail(id: number) {
    const product = await this.productRepository.findOne({
      where: {
        id,
        active: true,
        category: { active: true }
      },
      relations: { category: true, variants: { size: true, color: true } }
    });

    if (!product) throw new NotFoundException('Producto no encontrado o no disponible');

    // Filtrar solo variantes activas
    const activeVariants = product.variants.filter(v => v.active);

    return {
      id: product.id,
      name: product.name,
      price: product.price,
      categoryName: product.category.name,
      imageUrl: product.imageUrl,
      arEnabled: product.arEnabled,
      arImageUrl: product.arImageUrl ?? product.imageUrl,
      arType: product.arType,
      variants: activeVariants.map(v => ({
        id: v.id,
        sku: v.sku,
        sizeId: v.sizeId,
        sizeName: v.size.name,
        colorId: v.colorId,
        colorName: v.color.name
      }))
    };
  }

  async getAvailability(variantId: number) {
    const inventories = await this.inventoryRepository.find({
      where: {
        variantId,
        variant: { active: true, product: { active: true } },
        branch: { active: true } // solo sucursales activas
      },
      relations: { branch: { city: true } }
    });

    const result = [];

    for (const inv of inventories) {
      const available = inv.stock - inv.reserved;
      if (available > 0) {
        result.push({
          branchId: inv.branch.id,
          branchName: inv.branch.name,
          cityId: inv.branch.city.id,
          cityName: inv.branch.city.name,
          status: available <= 5 ? 'LOW_STOCK' : 'AVAILABLE'
        });
      }
    }

    return result;
  }

  async getTryOnData(variantId: number) {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId, active: true },
      relations: { product: true, size: true, color: true }
    });

    if (!variant || !variant.product.active) {
      throw new NotFoundException('Variante o producto no disponible para prueba virtual');
    }

    const product = variant.product;

    return {
      variantId: variant.id,
      sku: variant.sku,
      size: variant.size.name,
      color: variant.color.name,
      product: {
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        arEnabled: product.arEnabled,
        arImageUrl: product.arImageUrl ?? product.imageUrl,
        arType: product.arType
      }
    };
  }
}
