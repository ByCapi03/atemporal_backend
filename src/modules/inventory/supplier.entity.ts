import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Product } from '../catalog/product.entity';

@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  nit: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => Product, (product) => product.supplier)
  products: Product[];
}
