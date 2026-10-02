import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, OneToMany, ManyToMany
} from 'typeorm';
import { Category } from './category.entity';
import { Variant } from './variant.entity';
import { Collection } from './collection.entity';
import { Promotion } from './promotion.entity';

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
  colorizable: boolean;

  @Column({ nullable: true })
  sourceColor: string;

  @Column({ default: false })
  arEnabled: boolean;

  @Column({ nullable: true })
  arImageUrl: string;

  @Column({ nullable: true })
  arImagePublicId: string;

  @Column({ nullable: true })
  arTorsoUrl: string;

  @Column({ nullable: true })
  arTorsoPublicId: string;

  @Column({ nullable: true })
  arLeftSleeveUrl: string;

  @Column({ nullable: true })
  arLeftSleevePublicId: string;

  @Column({ nullable: true })
  arRightSleeveUrl: string;

  @Column({ nullable: true })
  arRightSleevePublicId: string;

  @Column({ type: 'enum', enum: ArGarmentType, nullable: true })
  arType: ArGarmentType;

  @ManyToOne(() => Category, (category) => category.products)
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @OneToMany(() => Variant, (variant) => variant.product)
  variants: Variant[];

  @Column({ nullable: true })
  collectionId: number;

  @ManyToOne(() => Collection, (collection) => collection.products, { nullable: true })
  @JoinColumn({ name: 'collectionId' })
  collection: Collection;

  @ManyToMany(() => Promotion, (promotion) => promotion.products)
  promotions: Promotion[];
}
