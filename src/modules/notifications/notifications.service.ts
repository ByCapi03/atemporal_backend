/**
 * NOTIFICATIONS SERVICE
 * Lógica Core: Envía emails usando el MailService (Nodemailer) y Notificaciones Push 
 * usando Firebase (FCM). También persiste en la base de datos (in-app notifications).
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Notification, NotificationDevice } from './notification.entity';
import { User } from '../auth/user.entity';
import { FirebaseAdminService } from '../../common/firebase/firebase-admin.service';
import { SendResponse } from 'firebase-admin/messaging';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationDevice) private deviceRepo: Repository<NotificationDevice>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private readonly firebaseAdmin: FirebaseAdminService,
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

  private async sendPushNotification(tokens: string[], payload: { title: string; message: string; data?: Record<string, string> }) {
    const results: any = { tokens, fcm: [], expo: [] };
    if (!tokens.length) return results;

    const fcmTokens = tokens.filter(t => !t.startsWith('ExponentPushToken') && !t.startsWith('ExpoPushToken'));
    const expoTokens = tokens.filter(t => t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken'));
    
    // Send to FCM
    if (fcmTokens.length > 0) {
      try {
        const messaging = this.firebaseAdmin.getMessaging();
        const message = {
          tokens: fcmTokens,
          notification: {
            title: payload.title,
            body: payload.message,
          },
          data: payload.data || {},
        };

        const response = await messaging.sendEachForMulticast(message);
        this.logger.log(`[PUSH FCM] Success: ${response.successCount}, Failures: ${response.failureCount}`);

        if (response.failureCount > 0) {
          const failedTokens: string[] = [];
          response.responses.forEach((resp: SendResponse, idx: number) => {
            if (!resp.success) {
              const errCode = resp.error?.code;
              if (errCode === 'messaging/invalid-registration-token' || errCode === 'messaging/registration-token-not-registered') {
                failedTokens.push(fcmTokens[idx]);
              }
            }
          });

          if (failedTokens.length > 0) {
            await this.deviceRepo.update(
              { token: In(failedTokens) },
              { active: false }
            );
          }
        }
        results.fcm.push(response);
      } catch (err) {
        this.logger.error('Failed to send push notification via FCM', err);
        results.fcm.push({ error: (err as any).message || err });
      }
    }

    // Send to Expo
    if (expoTokens.length > 0) {
      try {
        const messages = expoTokens.map(token => ({
          to: token,
          sound: 'default',
          title: payload.title,
          body: payload.message,
          data: payload.data || {},
        }));
        
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
        });
        const data = await res.json();
        this.logger.log(`[PUSH EXPO] Sent ${expoTokens.length} notifications. Status: ${res.status}`);
        results.expo.push({ status: res.status, data, tokens: expoTokens });
      } catch (err) {
        this.logger.error('Failed to send push notification via Expo', err);
        results.expo.push({ error: (err as any).message || err });
      }
    }
    return results;
  }

  async notifyReservationCreated(branchId: number, reservation: any, clientName: string) {
    try {
      // Find Encargados in the given branch
      const staffMembers = await this.userRepo.find({
        where: { branchId, active: true },
        relations: { userRoles: { role: true } }
      });

      const targetUsers = staffMembers.filter(user => 
        user.userRoles.some(ur => ur.active && ur.role.name === 'ENCARGADO')
      );

      if (targetUsers.length === 0) return;

      const title = `Nueva reserva #${reservation.id}`;
      const message = `${clientName} realizó una nueva reserva.`;

      const newNotifications = targetUsers.map(user => 
        this.notificationRepo.create({
          userId: user.id,
          type: 'RESERVATION_CREATED',
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
      await this.sendPushNotification(tokens, { 
        title, 
        message, 
        data: { 
          type: "RESERVATION_CREATED",
          reservationId: String(reservation.id),
          route: "/dashboard/reservations"
        } 
      });

    } catch (error) {
      this.logger.error(`Error notifying new reservation (Branch: ${branchId}, Res: ${reservation.id})`, error);
      // We swallow the error so we don't break the calling transaction flow
    }
  }

  async notifyReservationPaid(branchId: number, reservation: any, clientName: string, clientUserId: number) {
    try {
      // 1. Notify Client
      const clientTitle = `Pago confirmado para tu reserva #${reservation.id}`;
      const clientMessage = `Pago confirmado para tu reserva #${reservation.id}`;

      const clientNotification = this.notificationRepo.create({
        userId: clientUserId,
        type: 'RESERVATION_CONFIRMED',
        title: clientTitle,
        message: clientMessage,
        reservationId: reservation.id
      });
      await this.notificationRepo.save(clientNotification);

      const clientDevices = await this.deviceRepo.find({ where: { userId: clientUserId, active: true }});
      if (clientDevices.length > 0) {
        await this.sendPushNotification(clientDevices.map(d => d.token), {
          title: clientTitle,
          message: clientMessage,
          data: { type: 'RESERVATION_CONFIRMED', reservationId: String(reservation.id), route: "/reservations" }
        });
      }

      // 2. Notify Encargado
      const staffMembers = await this.userRepo.find({
        where: { branchId, active: true },
        relations: { userRoles: { role: true } }
      });
      const targetUsers = staffMembers.filter(user => 
        user.userRoles.some(ur => ur.active && ur.role.name === 'ENCARGADO')
      );

      if (targetUsers.length > 0) {
        const title = `Nueva reserva confirmada #${reservation.id}`;
        const message = `Nueva reserva confirmada #${reservation.id}`;

        const newNotifications = targetUsers.map(user => 
          this.notificationRepo.create({
            userId: user.id,
            type: 'RESERVATION_CONFIRMED',
            title,
            message,
            reservationId: reservation.id
          })
        );
        await this.notificationRepo.save(newNotifications);

        const targetUserIds = targetUsers.map(u => u.id);
        const devices = await this.deviceRepo.createQueryBuilder('device')
          .where('device.userId IN (:...userIds)', { userIds: targetUserIds })
          .andWhere('device.active = true')
          .getMany();

        if (devices.length > 0) {
          await this.sendPushNotification(devices.map(d => d.token), {
            title,
            message,
            data: { type: 'RESERVATION_CONFIRMED', reservationId: String(reservation.id), route: "/dashboard/reservations" }
          });
        }
      }
    } catch (error) {
      this.logger.error(`Error notifying reservation paid (Res: ${reservation.id})`, error);
    }
  }

  async notifyReservationDelivered(branchId: number, reservation: any, cashierName: string, clientUserId: number) {
    try {
      // 1. Notify Client
      const clientTitle = `Reserva entregada #${reservation.id}`;
      const clientMessage = `Tu reserva #${reservation.id} fue entregada correctamente.`;

      const clientNotification = this.notificationRepo.create({
        userId: clientUserId,
        type: 'RESERVATION_ATTENDED',
        title: clientTitle,
        message: clientMessage,
        reservationId: reservation.id
      });
      await this.notificationRepo.save(clientNotification);

      const clientDevices = await this.deviceRepo.find({ where: { userId: clientUserId, active: true }});
      if (clientDevices.length > 0) {
        await this.sendPushNotification(clientDevices.map(d => d.token), {
          title: clientTitle,
          message: clientMessage,
          data: { type: 'RESERVATION_ATTENDED', reservationId: String(reservation.id), route: "/reservations" }
        });
      }

      // 2. Notify Encargado
      const staffMembers = await this.userRepo.find({
        where: { branchId, active: true },
        relations: { userRoles: { role: true } }
      });
      const targetUsers = staffMembers.filter(user => 
        user.userRoles.some(ur => ur.active && ur.role.name === 'ENCARGADO')
      );

      if (targetUsers.length > 0) {
        const title = `Reserva #${reservation.id} atendida`;
        const message = `Reserva #${reservation.id} atendida`;

        const newNotifications = targetUsers.map(user => 
          this.notificationRepo.create({
            userId: user.id,
            type: 'RESERVATION_ATTENDED',
            title,
            message,
            reservationId: reservation.id
          })
        );
        await this.notificationRepo.save(newNotifications);

        const targetUserIds = targetUsers.map(u => u.id);
        const devices = await this.deviceRepo.createQueryBuilder('device')
          .where('device.userId IN (:...userIds)', { userIds: targetUserIds })
          .andWhere('device.active = true')
          .getMany();

        if (devices.length > 0) {
          await this.sendPushNotification(devices.map(d => d.token), {
            title,
            message,
            data: { type: 'RESERVATION_ATTENDED', reservationId: String(reservation.id), route: "/dashboard/reservations" }
          });
        }
      }
    } catch (error) {
      this.logger.error(`Error notifying reservation delivered (Res: ${reservation.id})`, error);
    }
  }

  async notifyReservationStatusUpdated(branchId: number, reservation: any, clientUserId: number, newStatus: string) {
    try {
      let clientTitle = `Estado de reserva #${reservation.id}`;
      let clientMessage = `Tu reserva ha cambiado a estado: ${newStatus}.`;

      if (newStatus === 'PREPARANDO') {
        clientTitle = `Preparando reserva #${reservation.id}`;
        clientMessage = `Estamos preparando tu reserva #${reservation.id}`;
      } else if (newStatus === 'LISTA') {
        clientTitle = `Reserva lista #${reservation.id}`;
        clientMessage = `Tu reserva #${reservation.id} está lista para recoger`;
      }

      const clientNotification = this.notificationRepo.create({
        userId: clientUserId,
        type: `RESERVATION_STATUS`,
        title: clientTitle,
        message: clientMessage,
        reservationId: reservation.id
      });
      await this.notificationRepo.save(clientNotification);

      const clientDevices = await this.deviceRepo.find({ where: { userId: clientUserId, active: true }});
      if (clientDevices.length > 0) {
        await this.sendPushNotification(clientDevices.map(d => d.token), {
          title: clientTitle,
          message: clientMessage,
          data: { type: 'RESERVATION_STATUS', reservationId: String(reservation.id), route: "/reservations" }
        });
      }

      if (newStatus === 'LISTA') {
        console.log({
          event: 'reservation.ready',
          reservationId: reservation.id,
          clientUserId,
          branchId
        });
        
        // Notify Cajeros of the branch
        const staffMembers = await this.userRepo.find({
          where: { branchId, active: true },
          relations: { userRoles: { role: true } }
        });
        const targetUsers = staffMembers.filter(user => 
          user.userRoles.some(ur => ur.active && ur.role.name === 'CAJERO')
        );

        if (targetUsers.length > 0) {
          const clientName = reservation.client ? `${reservation.client.name} ${reservation.client.lastName}` : 'Cliente';
          const cajeroTitle = `Reserva #${reservation.id} lista para entrega`;
          const cajeroMessage = `Reserva #${reservation.id} lista para entrega`;

          const cajeroNotifications = targetUsers.map(u => 
            this.notificationRepo.create({
              userId: u.id,
              type: 'RESERVATION_READY',
              title: cajeroTitle,
              message: cajeroMessage,
              reservationId: reservation.id
            })
          );
          await this.notificationRepo.save(cajeroNotifications);

          const targetUserIds = targetUsers.map(u => u.id);
          const devices = await this.deviceRepo.createQueryBuilder('device')
            .where('device.userId IN (:...userIds)', { userIds: targetUserIds })
            .andWhere('device.active = true')
            .getMany();

          console.log({
            devicesFound: devices.length,
            tokens: devices.map(d => d.token)
          });

          if (devices.length > 0) {
            await this.sendPushNotification(devices.map(d => d.token), {
              title: cajeroTitle,
              message: cajeroMessage,
              data: { type: 'RESERVATION_READY', reservationId: String(reservation.id), route: "/pos" }
            });
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error notifying status update (Res: ${reservation.id})`, error);
    }
  }

  // TEMPORARY FOR TESTING
  async testPushNotification(userId: number) {
    const title = 'Prueba de notificación';
    const message = 'Firebase Cloud Messaging está funcionando.';

    const notification = this.notificationRepo.create({
      userId,
      type: 'TEST',
      title,
      message,
    });
    await this.notificationRepo.save(notification);

    const devices = await this.deviceRepo.find({
      where: { userId, active: true }
    });

    const tokens = devices.map(d => d.token);

    if (tokens.length > 0) {
      const results = await this.sendPushNotification(tokens, {
        title,
        message,
        data: {
          type: 'TEST',
          route: '/dashboard'
        }
      });
      return { success: true, message: `Attempted to send to ${tokens.length} devices`, details: results };
    }

    return { success: false, message: 'No active devices found' };
  }
}
