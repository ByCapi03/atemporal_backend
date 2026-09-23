import { Controller, Get, Query, Param, UseGuards, Request } from '@nestjs/common';
import { SalesService } from './sales.service';
import { AuthGuard } from '../../common/guards/auth.guard';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('my')
  @UseGuards(AuthGuard)
  findMySales(@Request() req: any) {
    return this.salesService.findMySales(req.user);
  }

  @Get('my/:id')
  @UseGuards(AuthGuard)
  findOneMySale(@Param('id') id: string, @Request() req: any) {
    return this.salesService.findOneMySale(+id, req.user);
  }

  @Get()
  @UseGuards(AuthGuard)
  findAllSales(@Query() query: any, @Request() req: any) {
    return this.salesService.findAllSales(query, req.user);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  findOneSale(@Param('id') id: string, @Request() req: any) {
    return this.salesService.findOneSale(+id, req.user);
  }
}
