import {
  Entity, PrimaryGeneratedColumn, Column,
  OneToOne, JoinColumn, OneToMany, CreateDateColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';
import { Reservation } from '../reservations/reservation.entity';
import { Sale } from '../sales/sale.entity';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string;

  @CreateDateColumn()
  registrationDate: Date;

  @Column({ default: true })
  active: boolean;

  // Opcional: un cliente puede tener una cuenta de usuario
  @Column({ nullable: true, unique: true })
  userId: number;

  // Para activación de cuenta digital (cliente POS que activa cuenta web)
  // NOTA: En producción usar migraciones en lugar de synchronize:true
  @Column({ type: 'varchar', nullable: true })
  activationCodeHash: string | null;

  @Column({ type: 'timestamp', nullable: true })
  activationCodeExpiresAt: Date | null;

  @OneToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => Reservation, (reservation) => reservation.client)
  reservations: Reservation[];

  @OneToMany(() => Sale, (sale) => sale.client)
  sales: Sale[];
}
