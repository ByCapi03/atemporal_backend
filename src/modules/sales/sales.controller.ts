/**
 * SALES CONTROLLER
 * Flujo de Ventas Generales: Expone rutas generales, como /sales/my 
 * (para que el cliente vea su historial de compras en la app).
 */
import { Controller, Get, Post, Body, Query, Param, UseGuards, Request } from '@nestjs/common';
import { SalesService } from './sales.service';
import { AuthGuard } from '../../common/guards/auth.guard';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('checkout')
  @UseGuards(AuthGuard)
  checkoutWeb(@Body() body: any, @Request() req: any) {
    return this.salesService.checkoutWeb(body, req.user);
  }

  @Post(':saleId/cancel-pending')
  @UseGuards(AuthGuard)
  cancelPendingSale(@Param('saleId') saleId: string, @Request() req: any) {
    return this.salesService.cancelPendingSale(+saleId, req.user);
  }

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
