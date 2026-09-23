import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, OneToMany, CreateDateColumn,
} from 'typeorm';
import { Client } from '../clients/client.entity';
import { Branch } from '../branches/branch.entity';
import { ReservationItem } from './reservation-item.entity';
import { ReservationStatus } from '../../common/enums/reservation.enums';

@Entity('reservations')
export class Reservation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ReservationStatus, default: ReservationStatus.PENDIENTE })
  status: ReservationStatus;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', nullable: true })
  approximateTime: string;

  @CreateDateColumn()
  registrationDate: Date;

  @Column()
  clientId: number;

  @Column()
  branchId: number;

  @ManyToOne(() => Client, (client) => client.reservations)
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @OneToMany(() => ReservationItem, (item) => item.reservation)
  items: ReservationItem[];
}
