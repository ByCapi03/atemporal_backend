import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';


import { Product } from '../catalog/product.entity';
import { Sale } from '../sales/sale.entity';
import { Inventory } from '../inventory/inventory.entity';
import { Client } from '../clients/client.entity';
import { CatalogPricingService } from '../catalog/catalog-pricing.service';
import { SaleStatus } from '../sales/sales.enums';

@Injectable()
export class IntelligenceService {
  private readonly logger = new Logger(IntelligenceService.name);

  constructor(
    @InjectRepository(Product) private productRepository: Repository<Product>,
    @InjectRepository(Sale) private saleRepository: Repository<Sale>,
    @InjectRepository(Inventory) private inventoryRepository: Repository<Inventory>,
    @InjectRepository(Client) private clientRepository: Repository<Client>,
    private readonly catalogPricingService: CatalogPricingService,
  ) {}

  private async getClientProfile(userId: number) {
    const client = await this.clientRepository.findOneBy({ userId });
    if (!client) throw new UnauthorizedException('Perfil de cliente no encontrado');

    const sales = await this.saleRepository.find({
      where: { clientId: client.id, status: SaleStatus.COMPLETADA },
      relations: {
        items: {
          variant: {
            product: { category: true },
            size: true,
            color: true
          }
        }
      },
      order: { date: 'DESC' },
      take: 10
    });

    const categories = new Set<string>();
    const sizes = new Set<string>();
    const colors = new Set<string>();
    const purchasedProductIds = new Set<number>();

    sales.forEach(sale => {
      sale.items.forEach(item => {
        const v = item.variant;
        if (v && v.product) {
          purchasedProductIds.add(v.product.id);
          if (v.product.category) categories.add(v.product.category.name);
          if (v.size) sizes.add(v.size.name);
          if (v.color) colors.add(v.color.name);
        }
      });
    });

    return {
      hasHistory: sales.length > 0,
      profile: {
        categories: Array.from(categories),
        sizes: Array.from(sizes),
        colors: Array.from(colors)
      },
      purchasedProductIds
    };
  }

  private async getCandidates(branchId: number, limit: number = 20) {
    // Buscar inventario disponible
    const inventories = await this.inventoryRepository.find({
      where: { branchId },
      relations: {
        variant: {
          product: { category: true, collection: { season: true }, promotions: true }
        }
      }
    });

    const availableProductsMap = new Map<number, Product>();

    inventories.forEach(inv => {
      const available = inv.stock - inv.reserved;
      if (available > 0 && inv.variant?.active && inv.variant?.product?.active && inv.variant?.product?.category?.active) {
        if (!availableProductsMap.has(inv.variant.product.id)) {
          availableProductsMap.set(inv.variant.product.id, inv.variant.product);
        }
      }
    });

    return Array.from(availableProductsMap.values());
  }

  private async getAiRecommendations(profile: any, candidates: any[], limit: number): Promise<any[]> {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) throw new Error('No AI_API_KEY configured');

    const prompt = [
      'Eres un asistente experto en moda.',
      'Perfil del usuario:',
      JSON.stringify(profile),
      '',
      'Candidatos disponibles:',
      JSON.stringify(candidates.map(c => ({ id: c.id, name: c.name, category: c.category, collection: c.collection, season: c.season }))),
      '',
      'Instrucciones:',
      '1. Recomienda exactamente hasta ' + limit + ' productos.',
      '2. Devuelve UNICAMENTE un JSON estricto con la siguiente estructura:',
      '{',
      '  "recommendations": [',
      '    { "productId": 123, "reason": "Razón corta de por qué le gustaría" }',
      '  ]',
      '}',
      'No incluyas texto fuera del JSON.'
    ].join('\\n');

    try {
      const response = await fetch(
        process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: process.env.AI_MODEL || 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'You are a fashion recommendation system that strictly outputs JSON.' },
              { role: 'user', content: prompt }
            ],
            response_format: { type: "json_object" }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`API AI request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      const parsed = JSON.parse(content);
      return parsed.recommendations || [];
    } catch (err) {
      this.logger.error('Error llamando a IA', err);
      throw err;
    }
  }

  async getMyRecommendations(user: any, branchId: number, limit: number = 6) {
    let source = 'AI';
    let recommendations: any[] = [];
    let allCandidates: Product[] = [];
    
    try {
      const { hasHistory, profile, purchasedProductIds } = await this.getClientProfile(user.sub);
      allCandidates = await this.getCandidates(branchId, 20);

      // Priorizar candidatos (excluir comprados, tomar top 20)
      let filteredCandidates = allCandidates.filter(p => !purchasedProductIds.has(p.id));
      if (filteredCandidates.length < limit) {
        // Fallback: meter los comprados si no hay de otra
        filteredCandidates = allCandidates;
      }

      // Preparar DTO ligero para IA
      const candidatesDto = filteredCandidates.slice(0, 20).map(p => ({
        id: p.id,
        name: p.name,
        category: p.category?.name,
        collection: p.collection?.name,
        season: p.collection?.season?.name
      }));

      if (candidatesDto.length > 0) {
        try {
          const aiRecs = await this.getAiRecommendations(profile, candidatesDto, limit);
          recommendations = aiRecs
            .filter(r => r && r.productId && candidatesDto.some(c => c.id === r.productId)) // Validate ID
            .slice(0, limit);
        } catch (err) {
          source = 'FALLBACK';
        }
      }
    } catch (err) {
      source = 'FALLBACK';
    }

    if (source === 'FALLBACK' || recommendations.length === 0) {
      source = 'FALLBACK';
      if (allCandidates.length === 0) {
        allCandidates = await this.getCandidates(branchId, 20);
      }
      
      // Fallback: Tomar productos con promociones o simplemente los primeros
      const fallbackProducts = allCandidates
        .sort((a, b) => {
           // Priorize ones with active promotions
           const aPrice = this.catalogPricingService.getEffectivePrice(a);
           const bPrice = this.catalogPricingService.getEffectivePrice(b);
           if (aPrice.discount && !bPrice.discount) return -1;
           if (!aPrice.discount && bPrice.discount) return 1;
           return 0;
        })
        .slice(0, limit);

      recommendations = fallbackProducts.map(p => ({
        productId: p.id,
        reason: p.collection?.season?.name ? 'Colección de temporada' : 'Nuestra recomendación'
      }));
    }

    // Hydrate
    const finalRecs = recommendations.map(rec => {
      const product = allCandidates.find(p => p.id === rec.productId);
      if (!product) return null;
      
      const pricing = this.catalogPricingService.getEffectivePrice(product);
      
      return {
        product: {
          id: product.id,
          name: product.name,
          imageUrl: product.imageUrl,
          basePrice: pricing.basePrice,
          finalPrice: pricing.finalPrice,
          discount: pricing.discount,
          collectionName: product.collection?.name,
          seasonName: product.collection?.season?.name
        },
        reason: rec.reason
      };
    }).filter(Boolean);

    return {
      source,
      recommendations: finalRecs
    };
  }
}
