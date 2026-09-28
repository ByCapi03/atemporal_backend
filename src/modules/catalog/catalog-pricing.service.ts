import { Injectable } from '@nestjs/common';
import { Product } from './product.entity';
import { Promotion } from './promotion.entity';

@Injectable()
export class CatalogPricingService {
  getEffectivePrice(product: Product): {
    basePrice: number;
    finalPrice: number;
    discount: {
      type: 'PERCENTAGE' | 'FIXED';
      value: number;
      amount: number;
    } | null;
    promotion: Promotion | null;
  } {
    const basePrice = Number(product.price);
    
    if (!product.promotions || product.promotions.length === 0) {
      return {
        basePrice,
        finalPrice: basePrice,
        discount: null,
        promotion: null
      };
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const activePromotions = product.promotions.filter(p => {
      if (!p.active) return false;
      const startDate = new Date(p.startDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(p.endDate);
      endDate.setHours(23, 59, 59, 999);

      return now.getTime() >= startDate.getTime() && now.getTime() <= endDate.getTime();
    });

    if (activePromotions.length === 0) {
      return {
        basePrice,
        finalPrice: basePrice,
        discount: null,
        promotion: null
      };
    }

    let bestPromotion: Promotion | null = null;
    let minFinalPrice = basePrice;
    let bestDiscountAmount = 0;

    for (const p of activePromotions) {
      const val = Number(p.value);
      let currentDiscountAmount = 0;

      if (p.type === 'PERCENTAGE') {
        currentDiscountAmount = (basePrice * val) / 100;
      } else if (p.type === 'FIXED') {
        currentDiscountAmount = val;
      }

      const currentFinalPrice = Math.max(0, basePrice - currentDiscountAmount);

      if (currentFinalPrice < minFinalPrice || bestPromotion === null) {
        minFinalPrice = currentFinalPrice;
        bestPromotion = p;
        bestDiscountAmount = currentDiscountAmount;
      }
    }

    return {
      basePrice,
      finalPrice: Number(minFinalPrice.toFixed(2)),
      discount: bestPromotion ? {
        type: bestPromotion.type,
        value: Number(bestPromotion.value),
        amount: Number(bestDiscountAmount.toFixed(2))
      } : null,
      promotion: bestPromotion
    };
  }
}
