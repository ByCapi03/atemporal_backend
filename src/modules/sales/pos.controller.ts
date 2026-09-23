import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { PosService } from './pos.service';
import { CreatePosSaleDto } from './sales.dto';
import { AuthGuard } from '../../common/guards/auth.guard';

@Controller('pos')
@UseGuards(AuthGuard)
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get('products')
  getPosProducts(@Req() req: any) {
    const userId = req.user.sub;
    return this.posService.getPosProducts(userId);
  }

  @Post('sales')
  createPosSale(@Req() req: any, @Body() dto: CreatePosSaleDto) {
    const userId = req.user.sub;
    return this.posService.createPosSale(userId, dto);
  }
}
