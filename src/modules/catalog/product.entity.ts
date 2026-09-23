import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Category } from './category.entity';
import { Supplier } from '../inventory/supplier.entity';
import { Variant } from './variant.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ default: true })
  active: boolean;

  @Column()
  categoryId: number;

  @Column()
  supplierId: number;

  @ManyToOne(() => Category, (category) => category.products)
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @ManyToOne(() => Supplier, (supplier) => supplier.products)
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @OneToMany(() => Variant, (variant) => variant.product)
  variants: Variant[];
}
