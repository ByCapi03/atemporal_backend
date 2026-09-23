import { Controller, Get, Post, Body, UseGuards, Req, Query } from '@nestjs/common';
import { PosService } from './pos.service';
import { CreatePosSaleDto, CreatePosClientDto } from './sales.dto';
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

  @Get('clients')
  searchClients(@Req() req: any, @Query('search') search: string) {
    const userId = req.user.sub;
    return this.posService.searchClients(userId, search || '');
  }

  @Post('clients')
  createPosClient(@Req() req: any, @Body() dto: CreatePosClientDto) {
    const userId = req.user.sub;
    return this.posService.createPosClient(userId, dto);
  }

  @Post('sales')
  createPosSale(@Req() req: any, @Body() dto: CreatePosSaleDto) {
    const userId = req.user.sub;
    return this.posService.createPosSale(userId, dto);
  }
}
