import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Product } from './product.entity';
import { Size } from './size.entity';
import { Color } from './color.entity';
import { Inventory } from '../inventory/inventory.entity';
import { ReservationItem } from '../reservations/reservation-item.entity';
import { SaleItem } from '../sales/sale-item.entity';

@Entity('variants')
export class Variant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  sku: string;

  @Column({ default: true })
  active: boolean;

  @Column()
  productId: number;

  @Column()
  sizeId: number;

  @Column()
  colorId: number;

  @ManyToOne(() => Product, (product) => product.variants)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => Size, (size) => size.variants)
  @JoinColumn({ name: 'sizeId' })
  size: Size;

  @ManyToOne(() => Color, (color) => color.variants)
  @JoinColumn({ name: 'colorId' })
  color: Color;

  @OneToMany(() => Inventory, (inventory) => inventory.variant)
  inventories: Inventory[];

  @OneToMany(() => ReservationItem, (item) => item.variant)
  reservationItems: ReservationItem[];

  @OneToMany(() => SaleItem, (item) => item.variant)
  saleItems: SaleItem[];
}
