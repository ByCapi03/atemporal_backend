import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';
import { Product } from '../catalog/product.entity';
import { Sale } from '../sales/sale.entity';
import { Inventory } from '../inventory/inventory.entity';
import { Client } from '../clients/client.entity';
import { CatalogModule } from '../catalog/catalog.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Sale, Inventory, Client]),
    CatalogModule,
    AuthModule
  ],
  controllers: [IntelligenceController],
  providers: [IntelligenceService],
})
export class IntelligenceModule {}
