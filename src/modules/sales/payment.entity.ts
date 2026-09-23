import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Sale } from './sale.entity';
import { PaymentMethod, PaymentStatus } from '../../common/enums/sales.enums';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDIENTE })
  status: PaymentStatus;

  @CreateDateColumn()
  date: Date;

  @Column({ type: 'varchar', nullable: true })
  transactionReference: string;

  @Column()
  saleId: number;

  @ManyToOne(() => Sale, (sale) => sale.payments)
  @JoinColumn({ name: 'saleId' })
  sale: Sale;
}
