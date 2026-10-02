import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Product } from '../catalog/product.entity';
import { Variant } from '../catalog/variant.entity';
import { Inventory } from '../inventory/inventory.entity';
import { CatalogPricingService } from '../catalog/catalog-pricing.service';
import { CloudinaryService } from '../../common/cloudinary.service';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Product) private productRepository: Repository<Product>,
    @InjectRepository(Variant) private variantRepository: Repository<Variant>,
    @InjectRepository(Inventory) private inventoryRepository: Repository<Inventory>,
    private readonly catalogPricingService: CatalogPricingService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async getPublicProducts() {
    // Solo productos activos, con categoría activa y que tengan variantes activas
    const products = await this.productRepository.find({
      where: {
        active: true,
        category: { active: true },
        variants: { active: true }
      },
      relations: { category: true, variants: true, collection: { season: true }, promotions: true }
    });

    return products.map(p => {
      const pricing = this.catalogPricingService.getEffectivePrice(p);
      return {
        id: p.id,
        name: p.name,
        price: pricing.basePrice,
        finalPrice: pricing.finalPrice,
        discount: pricing.discount,
        seasonName: p.collection?.season?.name,
        collectionName: p.collection?.name,
        categoryId: p.categoryId,
        categoryName: p.category.name,
        imageUrl: p.imageUrl,
        arEnabled: p.arEnabled,
        arImageUrl: p.arImageUrl ?? p.imageUrl,
        arType: p.arType
      };
    });
  }

  async getPublicProductDetail(id: number) {
    const product = await this.productRepository.findOne({
      where: {
        id,
        active: true,
        category: { active: true }
      },
      relations: { category: true, variants: { size: true, color: true }, collection: { season: true }, promotions: true }
    });

    if (!product) throw new NotFoundException('Producto no encontrado o no disponible');

    const pricing = this.catalogPricingService.getEffectivePrice(product);

    // Filtrar solo variantes activas
    const activeVariants = product.variants.filter(v => v.active);

    return {
      id: product.id,
      name: product.name,
      price: pricing.basePrice,
      finalPrice: pricing.finalPrice,
      discount: pricing.discount,
      seasonName: product.collection?.season?.name,
      collectionName: product.collection?.name,
      categoryName: product.category.name,
      imageUrl: product.imageUrl,
      arEnabled: product.arEnabled,
      arImageUrl: product.arImageUrl ?? product.imageUrl,
      arType: product.arType,
      variants: activeVariants.map(v => {
        let previewImageUrl = product.imageUrl;
        let previewArImageUrl = product.arImageUrl ?? product.imageUrl;

        if (product.colorizable && product.sourceColor && v.color.hexCode) {
          if (product.imagePublicId) {
            previewImageUrl = this.cloudinaryService.getColorizedImageUrl(product.imagePublicId, product.sourceColor, v.color.hexCode);
          }
          if (product.arImagePublicId) {
            previewArImageUrl = this.cloudinaryService.getColorizedImageUrl(product.arImagePublicId, product.sourceColor, v.color.hexCode);
          }
        }

        return {
          id: v.id,
          sku: v.sku,
          sizeId: v.sizeId,
          sizeName: v.size.name,
          colorId: v.colorId,
          colorName: v.color.name,
          colorHexCode: v.color.hexCode,
          previewImageUrl,
          previewArImageUrl
        };
      })
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
          available,
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

    let previewImageUrl = product.imageUrl;
    let previewArImageUrl = product.arImageUrl ?? product.imageUrl;
    let previewArTorsoUrl = product.arTorsoUrl;
    let previewArLeftSleeveUrl = product.arLeftSleeveUrl;
    let previewArRightSleeveUrl = product.arRightSleeveUrl;

    if (product.colorizable && product.sourceColor && variant.color.hexCode) {
      if (product.imagePublicId) {
        previewImageUrl = this.cloudinaryService.getColorizedImageUrl(product.imagePublicId, product.sourceColor, variant.color.hexCode);
      }
      if (product.arImagePublicId) {
        previewArImageUrl = this.cloudinaryService.getColorizedImageUrl(product.arImagePublicId, product.sourceColor, variant.color.hexCode);
      }
      if (product.arTorsoPublicId) {
        previewArTorsoUrl = this.cloudinaryService.getColorizedImageUrl(product.arTorsoPublicId, product.sourceColor, variant.color.hexCode);
      }
      if (product.arLeftSleevePublicId) {
        previewArLeftSleeveUrl = this.cloudinaryService.getColorizedImageUrl(product.arLeftSleevePublicId, product.sourceColor, variant.color.hexCode);
      }
      if (product.arRightSleevePublicId) {
        previewArRightSleeveUrl = this.cloudinaryService.getColorizedImageUrl(product.arRightSleevePublicId, product.sourceColor, variant.color.hexCode);
      }
    }

    return {
      variantId: variant.id,
      sku: variant.sku,
      size: variant.size.name,
      color: variant.color.name,
      colorHexCode: variant.color.hexCode,
      product: {
        id: product.id,
        name: product.name,
        imageUrl: previewImageUrl,
        arEnabled: product.arEnabled,
        arImageUrl: previewArImageUrl,
        arTorsoUrl: previewArTorsoUrl,
        arLeftSleeveUrl: previewArLeftSleeveUrl,
        arRightSleeveUrl: previewArRightSleeveUrl,
        arType: product.arType
      }
    };
  }
}
