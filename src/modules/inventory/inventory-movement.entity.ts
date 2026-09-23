import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Inventory } from './inventory.entity';
import { User } from '../auth/user.entity';
import { MovementType } from '../../common/enums/inventory.enums';

@Entity('inventory_movements')
export class InventoryMovement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  quantity: number;

  @CreateDateColumn()
  movementDate: Date;

  @Column({ type: 'enum', enum: MovementType })
  type: MovementType;

  @Column({ type: 'text', nullable: true })
  observation: string;

  @Column()
  inventoryId: number;

  @Column({ nullable: true })
  userId: number;

  @ManyToOne(() => Inventory, (inventory) => inventory.movements)
  @JoinColumn({ name: 'inventoryId' })
  inventory: Inventory;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;
}
