/**
 * NOTIFICATION ENTITIES
 * Entidades de Base de Datos: 
 * - Notification: Guarda el historial de notificaciones (push/in-app) para los usuarios.
 * - NotificationDevice: Guarda los tokens de los dispositivos (FCM) de cada usuario para poder enviarles push notifications.
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../auth/user.entity';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  type: string;

  @Column()
  title: string;

  @Column('text')
  message: string;

  @Column({ nullable: true })
  reservationId: number;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}

@Entity('notification_devices')
export class NotificationDevice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  token: string;

  @Column()
  platform: string;

  @Column({ default: true })
  active: boolean;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}
