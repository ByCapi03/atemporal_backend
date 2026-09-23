import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto, UpdateSaleDto } from './sale.dto';
import { CreatePaymentDto, UpdatePaymentDto } from './payment.dto';

@Controller()
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('sales')
  createSale(@Body() createSaleDto: CreateSaleDto) { return this.salesService.createSale(createSaleDto); }
  @Get('sales')
  findAllSales() { return this.salesService.findAllSales(); }
  @Get('sales/:id')
  findOneSale(@Param('id') id: string) { return this.salesService.findOneSale(+id); }
  @Patch('sales/:id')
  updateSale(@Param('id') id: string, @Body() updateSaleDto: UpdateSaleDto) { return this.salesService.updateSale(+id, updateSaleDto); }
  @Delete('sales/:id')
  removeSale(@Param('id') id: string) { return this.salesService.removeSale(+id); }

  @Post('payments')
  createPayment(@Body() createPaymentDto: CreatePaymentDto) { return this.salesService.createPayment(createPaymentDto); }
  @Get('payments')
  findAllPayments() { return this.salesService.findAllPayments(); }
  @Get('payments/:id')
  findOnePayment(@Param('id') id: string) { return this.salesService.findOnePayment(+id); }
  @Patch('payments/:id')
  updatePayment(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto) { return this.salesService.updatePayment(+id, updatePaymentDto); }
  @Delete('payments/:id')
  removePayment(@Param('id') id: string) { return this.salesService.removePayment(+id); }
}
