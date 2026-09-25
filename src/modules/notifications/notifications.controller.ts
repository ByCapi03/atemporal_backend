/**
 * NOTIFICATIONS CONTROLLER
 * Endpoints: Provee las rutas para que el usuario consulte sus notificaciones in-app 
 * (/notifications/my), las marque como leídas y registre su dispositivo (/notifications/device) 
 * para recibir push notifications.
 */
import { Controller, Get, Patch, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { RegisterDeviceDto } from './notifications.dto';
import { AuthGuard } from '../../common/guards/auth.guard';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('my')
  findMyNotifications(@Req() req: any) {
    return this.notificationsService.findMyNotifications(req.user.sub);
  }

  @Patch('read-all')
  markAllAsRead(@Req() req: any) {
    return this.notificationsService.markAllAsRead(req.user.sub);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.notificationsService.markAsRead(+id, req.user.sub);
  }

  @Post('devices')
  registerDevice(@Body() dto: RegisterDeviceDto, @Req() req: any) {
    return this.notificationsService.registerDevice(req.user.sub, dto.token, dto.platform);
  }

  // TEMPORARY ENDPOINT FOR TESTING
  @Post('test')
  testPush(@Req() req: any) {
    return this.notificationsService.testPushNotification(req.user.sub);
  }
}
