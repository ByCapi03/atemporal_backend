import { Injectable } from '@nestjs/common';
import { CreateSaleDto, UpdateSaleDto } from './sale.dto';
import { CreatePaymentDto, UpdatePaymentDto } from './payment.dto';

@Injectable()
export class SalesService {
  createSale(createSaleDto: CreateSaleDto) { return 'This action adds a new sale'; }
  findAllSales() { return `This action returns all sales`; }
  findOneSale(id: number) { return `This action returns a #${id} sale`; }
  updateSale(id: number, updateSaleDto: UpdateSaleDto) { return `This action updates a #${id} sale`; }
  removeSale(id: number) { return `This action removes a #${id} sale`; }

  createPayment(createPaymentDto: CreatePaymentDto) { return 'This action adds a new payment'; }
  findAllPayments() { return `This action returns all payments`; }
  findOnePayment(id: number) { return `This action returns a #${id} payment`; }
  updatePayment(id: number, updatePaymentDto: UpdatePaymentDto) { return `This action updates a #${id} payment`; }
  removePayment(id: number) { return `This action removes a #${id} payment`; }
}
