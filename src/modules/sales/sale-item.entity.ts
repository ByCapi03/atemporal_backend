import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Sale } from './sale.entity';
import { Variant } from '../catalog/variant.entity';

@Entity('sale_items')
export class SaleItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  @Column()
  saleId: number;

  @Column()
  variantId: number;

  @ManyToOne(() => Sale, (sale) => sale.items)
  @JoinColumn({ name: 'saleId' })
  sale: Sale;

  @ManyToOne(() => Variant, (variant) => variant.saleItems)
  @JoinColumn({ name: 'variantId' })
  variant: Variant;
}
