import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Season } from './season.entity';
import { Product } from './product.entity';

@Entity('collections')
export class Collection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  seasonId: number;

  @Column({ default: true })
  active: boolean;

  @ManyToOne(() => Season, (season) => season.collections)
  @JoinColumn({ name: 'seasonId' })
  season: Season;

  @OneToMany(() => Product, (product) => product.collection)
  products: Product[];
}
