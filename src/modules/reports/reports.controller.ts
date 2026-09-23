import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AuthGuard } from '../../common/guards/auth.guard';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  @UseGuards(AuthGuard)
  getSalesReport(@Query() query: any, @Request() req: any) {
    return this.reportsService.getSalesReport(query, req.user);
  }

  @Get('products')
  @UseGuards(AuthGuard)
  getProductsReport(@Query() query: any, @Request() req: any) {
    return this.reportsService.getProductsReport(query, req.user);
  }

  @Get('inventory')
  @UseGuards(AuthGuard)
  getInventoryReport(@Query() query: any, @Request() req: any) {
    return this.reportsService.getInventoryReport(query, req.user);
  }

  @Get('reservations')
  @UseGuards(AuthGuard)
  getReservationsReport(@Query() query: any, @Request() req: any) {
    return this.reportsService.getReservationsReport(query, req.user);
  }
}
