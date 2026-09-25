/**
 * SALE ENTITY
 * Entidad de Base de Datos: Representa la "Cabecera" o factura de la venta. 
 * Guarda el total, el canal (WEB o POS), y se relaciona con el Cliente, 
 * la Sucursal y (opcionalmente) con una Reserva previa.
 */
import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, OneToMany, OneToOne, CreateDateColumn,
} from 'typeorm';
import { Branch } from '../branches/branch.entity';
import { Client } from '../clients/client.entity';
import { User } from '../auth/user.entity';
import { SaleItem } from './sale-item.entity';
import { Payment } from './payment.entity';
import { Reservation } from '../reservations/reservation.entity';
import { CashSession } from './cash-session.entity';
import { SaleChannel, SaleStatus } from './sales.enums';

@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: SaleChannel })
  channel: SaleChannel;

  @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.PENDIENTE })
  status: SaleStatus;

  @CreateDateColumn()
  date: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  discount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;

  @Column()
  branchId: number;

  @Column({ nullable: true })
  clientId: number;

  @Column({ nullable: true })
  userId: number;

  @Column({ nullable: true })
  cashSessionId: number;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @ManyToOne(() => Client, (client) => client.sales, { nullable: true })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => SaleItem, (item) => item.sale)
  items: SaleItem[];

  @OneToMany(() => Payment, (payment) => payment.sale)
  payments: Payment[];

  @ManyToOne(() => CashSession, (cashSession) => cashSession.sales, { nullable: true })
  @JoinColumn({ name: 'cashSessionId' })
  cashSession: CashSession;

  @Column({ nullable: true })
  reservationId: number;

  @OneToOne(() => Reservation, (reservation) => reservation.sale, { nullable: true })
  @JoinColumn({ name: 'reservationId' })
  reservation: Reservation;
}
