import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Reservation } from './reservation.entity';
import { Variant } from '../catalog/variant.entity';

@Entity('reservation_items')
export class ReservationItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  quantity: number;

  @Column()
  reservationId: number;

  @Column()
  variantId: number;

  @ManyToOne(() => Reservation, (reservation) => reservation.items)
  @JoinColumn({ name: 'reservationId' })
  reservation: Reservation;

  @ManyToOne(() => Variant, (variant) => variant.reservationItems)
  @JoinColumn({ name: 'variantId' })
  variant: Variant;
}
