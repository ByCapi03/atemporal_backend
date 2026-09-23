import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Category } from './category.entity';
import { Variant } from './variant.entity';

export enum ArGarmentType {
  TOP = 'TOP',
  BOTTOM = 'BOTTOM',
  DRESS = 'DRESS',
}

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

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ nullable: true })
  imagePublicId: string;

  @Column({ default: false })
  arEnabled: boolean;

  @Column({ nullable: true })
  arImageUrl: string;

  @Column({ nullable: true })
  arImagePublicId: string;

  @Column({ type: 'enum', enum: ArGarmentType, nullable: true })
  arType: ArGarmentType;

  @ManyToOne(() => Category, (category) => category.products)
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @OneToMany(() => Variant, (variant) => variant.product)
  variants: Variant[];
}
