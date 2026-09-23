import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { CashSessionsService } from './cash-sessions.service';
import { OpenCashSessionDto } from './sales.dto';
import { AuthGuard } from '../../common/guards/auth.guard';

@Controller('cash-sessions')
@UseGuards(AuthGuard)
export class CashSessionsController {
  constructor(private readonly cashSessionsService: CashSessionsService) {}

  @Post('open')
  openSession(@Req() req: any, @Body() openCashSessionDto: OpenCashSessionDto) {
    const userId = req.user.sub;
    return this.cashSessionsService.openSession(userId, openCashSessionDto);
  }

  @Get('current')
  getCurrentSession(@Req() req: any) {
    const userId = req.user.sub;
    return this.cashSessionsService.getCurrentSession(userId);
  }

  @Post('close')
  closeSession(@Req() req: any, @Body() closeCashSessionDto: import('./sales.dto').CloseCashSessionDto) {
    const userId = req.user.sub;
    return this.cashSessionsService.closeSession(userId, closeCashSessionDto);
  }
}
