import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, Index
} from 'typeorm';
import { Branch } from '../branches/branch.entity';
import { User } from '../auth/user.entity';
import { CashSessionStatus } from '../../common/enums/sales.enums';
import { Sale } from './sale.entity';
import { OneToMany } from 'typeorm';

@Entity('cash_sessions')
// Postgres partial index to guarantee only one OPEN session per cashier
@Index('IDX_UNIQUE_OPEN_SESSION_PER_CASHIER', ['cashierId'], { unique: true, where: "status = 'OPEN'" })
export class CashSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  branchId: number;

  @Column()
  cashierId: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  openingAmount: number;

  @CreateDateColumn()
  openedAt: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  closingAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  expectedAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  difference: number;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date;

  @Column({ type: 'enum', enum: CashSessionStatus, default: CashSessionStatus.OPEN })
  status: CashSessionStatus;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'cashierId' })
  cashier: User;

  @OneToMany(() => Sale, (sale) => sale.cashSession)
  sales: Sale[];
}
