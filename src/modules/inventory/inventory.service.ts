import { Injectable } from '@nestjs/common';
import { CreateInventoryDto, UpdateInventoryDto } from './inventory.dto';
import { CreateSupplierDto, UpdateSupplierDto } from './supplier.dto';

@Injectable()
export class InventoryService {
  createInventory(createInventoryDto: CreateInventoryDto) { return 'This action adds a new inventory'; }
  findAllInventory() { return `This action returns all inventory`; }
  findOneInventory(id: number) { return `This action returns a #${id} inventory`; }
  updateInventory(id: number, updateInventoryDto: UpdateInventoryDto) { return `This action updates a #${id} inventory`; }
  removeInventory(id: number) { return `This action removes a #${id} inventory`; }

  createSupplier(createSupplierDto: CreateSupplierDto) { return 'This action adds a new supplier'; }
  findAllSuppliers() { return `This action returns all suppliers`; }
  findOneSupplier(id: number) { return `This action returns a #${id} supplier`; }
  updateSupplier(id: number, updateSupplierDto: UpdateSupplierDto) { return `This action updates a #${id} supplier`; }
  removeSupplier(id: number) { return `This action removes a #${id} supplier`; }
}
