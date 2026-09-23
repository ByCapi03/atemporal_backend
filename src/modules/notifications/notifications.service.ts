import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { NotificationDevice } from './notification-device.entity';
import { User } from '../auth/user.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationDevice) private deviceRepo: Repository<NotificationDevice>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async findMyNotifications(userId: number) {
    return this.notificationRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50 // Limit to recent 50 to avoid massive payloads
    });
  }

  async markAsRead(id: number, userId: number) {
    await this.notificationRepo.update({ id, userId }, { read: true });
    return { success: true };
  }

  async markAllAsRead(userId: number) {
    await this.notificationRepo.update({ userId, read: false }, { read: true });
    return { success: true };
  }

  async registerDevice(userId: number, token: string, platform: string) {
    let device = await this.deviceRepo.findOne({ where: { userId, token } });
    if (!device) {
      device = this.deviceRepo.create({ userId, token, platform, active: true });
    } else {
      device.active = true;
      device.platform = platform;
    }
    return this.deviceRepo.save(device);
  }

  private async sendPushNotification(tokens: string[], payload: any) {
    if (!tokens.length) return;
    
    // MOCK: Stub for Firebase / APNS
    try {
      this.logger.log(`[PUSH MOCK] Sending push to ${tokens.length} devices... Payload: ${JSON.stringify(payload)}`);
      // Here you would do: await firebaseAdmin.messaging().sendMulticast(...)
    } catch (err) {
      this.logger.error('Failed to send push notification', err);
    }
  }

  async notifyNewReservation(branchId: number, reservation: any, clientName: string) {
    try {
      // Find Encargados and Cajeros in the given branch
      const staffMembers = await this.userRepo.find({
        where: { branchId, active: true },
        relations: { userRoles: { role: true } }
      });

      const targetUsers = staffMembers.filter(user => 
        user.userRoles.some(ur => ur.active && (ur.role.name === 'ENCARGADO' || ur.role.name === 'CAJERO'))
      );

      if (targetUsers.length === 0) return;

      const title = `Nueva reserva #${reservation.id}`;
      const dateStr = new Date(reservation.date).toLocaleDateString();
      const message = `${clientName} realizó una reserva para el ${dateStr} a las ${reservation.approximateTime}.`;

      const newNotifications = targetUsers.map(user => 
        this.notificationRepo.create({
          userId: user.id,
          type: 'NEW_RESERVATION',
          title,
          message,
          reservationId: reservation.id
        })
      );

      await this.notificationRepo.save(newNotifications);

      // Get devices for these users
      const targetUserIds = targetUsers.map(u => u.id);
      const devices = await this.deviceRepo.createQueryBuilder('device')
        .where('device.userId IN (:...userIds)', { userIds: targetUserIds })
        .andWhere('device.active = true')
        .getMany();

      const tokens = devices.map(d => d.token);
      
      // Attempt to push
      await this.sendPushNotification(tokens, { title, message, reservationId: reservation.id });

    } catch (error) {
      this.logger.error(`Error notifying new reservation (Branch: ${branchId}, Res: ${reservation.id})`, error);
      // We swallow the error so we don't break the calling transaction flow
    }
  }
}
