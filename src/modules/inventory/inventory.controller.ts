import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto, UpdateInventoryDto } from './inventory.dto';
import { CreateSupplierDto, UpdateSupplierDto } from './supplier.dto';

@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('inventory')
  createInventory(@Body() createInventoryDto: CreateInventoryDto) { return this.inventoryService.createInventory(createInventoryDto); }
  @Get('inventory')
  findAllInventory() { return this.inventoryService.findAllInventory(); }
  @Get('inventory/:id')
  findOneInventory(@Param('id') id: string) { return this.inventoryService.findOneInventory(+id); }
  @Patch('inventory/:id')
  updateInventory(@Param('id') id: string, @Body() updateInventoryDto: UpdateInventoryDto) { return this.inventoryService.updateInventory(+id, updateInventoryDto); }
  @Delete('inventory/:id')
  removeInventory(@Param('id') id: string) { return this.inventoryService.removeInventory(+id); }

  @Post('suppliers')
  createSupplier(@Body() createSupplierDto: CreateSupplierDto) { return this.inventoryService.createSupplier(createSupplierDto); }
  @Get('suppliers')
  findAllSuppliers() { return this.inventoryService.findAllSuppliers(); }
  @Get('suppliers/:id')
  findOneSupplier(@Param('id') id: string) { return this.inventoryService.findOneSupplier(+id); }
  @Patch('suppliers/:id')
  updateSupplier(@Param('id') id: string, @Body() updateSupplierDto: UpdateSupplierDto) { return this.inventoryService.updateSupplier(+id, updateSupplierDto); }
  @Delete('suppliers/:id')
  removeSupplier(@Param('id') id: string) { return this.inventoryService.removeSupplier(+id); }
}
