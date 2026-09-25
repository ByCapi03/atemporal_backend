/**
 * NOTIFICATIONS MODULE
 * Configuración Central: Orquesta el servicio de notificaciones. Es Global (@Global)
 * para que cualquier otro módulo (ej. Reservations) pueda inyectar NotificationsService
 * sin tener que importar este módulo repetidamente.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationDevice } from './notification.entity';
import { User } from '../auth/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationDevice, User]),
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService]
})
export class NotificationsModule {}
