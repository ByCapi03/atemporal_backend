import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Variant } from './variant.entity';

@Entity('sizes')
export class Size {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => Variant, (variant) => variant.size)
  variants: Variant[];
}
