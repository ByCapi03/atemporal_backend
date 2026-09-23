import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, OneToMany, Unique, UpdateDateColumn,
} from 'typeorm';
import { Branch } from '../branches/branch.entity';
import { Variant } from '../catalog/variant.entity';
import { InventoryMovement } from './inventory-movement.entity';

@Entity('inventory')
@Unique(['branchId', 'variantId'])
export class Inventory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: 0 })
  stock: number;

  @Column({ default: 0 })
  reserved: number;

  @Column({ default: 0 })
  stockMin: number;

  @Column({ nullable: true })
  stockMax: number;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  branchId: number;

  @Column()
  variantId: number;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @ManyToOne(() => Variant, (variant) => variant.inventories)
  @JoinColumn({ name: 'variantId' })
  variant: Variant;

  @OneToMany(() => InventoryMovement, (movement) => movement.inventory)
  movements: InventoryMovement[];
}
