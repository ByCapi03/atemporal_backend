import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto, UpdateInventoryDto, RegisterMovementDto } from './inventory.dto';
import { CreateSupplierDto, UpdateSupplierDto } from './supplier.dto';
import { AuthGuard } from '../../common/guards/auth.guard';

@UseGuards(AuthGuard)
@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('inventory')
  createInventory(@Body() createInventoryDto: CreateInventoryDto, @Request() req: any) { 
    return this.inventoryService.createInventory(createInventoryDto, req.user); 
  }

  @Get('inventory')
  findAllInventory(@Request() req: any) { 
    return this.inventoryService.findAllInventory(req.user); 
  }

  @Get('inventory/:id')
  findOneInventory(@Param('id') id: string, @Request() req: any) { 
    return this.inventoryService.findOneInventory(+id, req.user); 
  }

  @Patch('inventory/:id')
  updateInventory(@Param('id') id: string, @Body() updateInventoryDto: UpdateInventoryDto, @Request() req: any) { 
    return this.inventoryService.updateInventory(+id, updateInventoryDto, req.user); 
  }

  @Delete('inventory/:id')
  removeInventory(@Param('id') id: string, @Request() req: any) { 
    return this.inventoryService.removeInventory(+id, req.user); 
  }

  @Post('inventory/movement')
  registerMovement(@Body() registerMovementDto: RegisterMovementDto, @Request() req: any) {
    return this.inventoryService.registerMovement(registerMovementDto, req.user);
  }

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
