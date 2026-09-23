import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Variant } from './variant.entity';

@Entity('colors')
export class Color {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => Variant, (variant) => variant.color)
  variants: Variant[];
}
