import { Injectable, NotFoundException, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { CreateInventoryDto, UpdateInventoryDto, RegisterMovementDto } from './inventory.dto';
import { CreateSupplierDto, UpdateSupplierDto } from './supplier.dto';
import { Supplier } from './supplier.entity';
import { Inventory } from './inventory.entity';
import { InventoryMovement } from './inventory-movement.entity';
import { Branch } from '../branches/branch.entity';
import { Variant } from '../catalog/variant.entity';
import { MovementType } from '../../common/enums/inventory.enums';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Supplier) private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Inventory) private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(InventoryMovement) private readonly movementRepository: Repository<InventoryMovement>,
    @InjectRepository(Branch) private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Variant) private readonly variantRepository: Repository<Variant>,
    private readonly dataSource: DataSource,
  ) {}

  async createInventory(createInventoryDto: CreateInventoryDto, currentUser: any) {
    const isEncargado = currentUser.roles.includes('ENCARGADO');
    const isAdmin = currentUser.roles.includes('ADMIN');

    if (isEncargado && createInventoryDto.branchId !== currentUser.branchId) {
      throw new UnauthorizedException('ENCARGADO solo puede crear inventario en su sucursal');
    }
    if (!isEncargado && !isAdmin) {
      throw new UnauthorizedException('Permisos insuficientes');
    }

    const branch = await this.branchRepository.findOneBy({ id: createInventoryDto.branchId });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    
    const variant = await this.variantRepository.findOneBy({ id: createInventoryDto.variantId });
    if (!variant) throw new NotFoundException('Variante no encontrada');

    const existing = await this.inventoryRepository.findOneBy({ 
      branchId: createInventoryDto.branchId, 
      variantId: createInventoryDto.variantId 
    });

    if (existing) {
      throw new ConflictException('Ya existe un registro de inventario para esta sucursal y variante');
    }

    if (createInventoryDto.stockMin !== undefined && createInventoryDto.stockMax !== undefined) {
      if (createInventoryDto.stockMax < createInventoryDto.stockMin) {
        throw new BadRequestException('stockMax no puede ser menor a stockMin');
      }
    }

    const inventory = this.inventoryRepository.create({
      ...createInventoryDto,
      stock: 0,
      reserved: 0
    });

    return this.inventoryRepository.save(inventory);
  }

  async findAllInventory(currentUser: any) {
    const isEncargado = currentUser.roles.includes('ENCARGADO');
    
    let whereClause = {};
    if (isEncargado) {
      whereClause = { branchId: currentUser.branchId };
    }

    return this.inventoryRepository.find({
      where: whereClause,
      relations: {
        branch: true,
        variant: { product: true, size: true, color: true }
      },
      order: { id: 'ASC' }
    });
  }

  async findOneInventory(id: number, currentUser: any) {
    const isEncargado = currentUser.roles.includes('ENCARGADO');
    
    const inventory = await this.inventoryRepository.findOne({
      where: { id },
      relations: {
        branch: true,
        variant: { product: true, size: true, color: true }
      }
    });

    if (!inventory) throw new NotFoundException(`Inventario #${id} no encontrado`);

    if (isEncargado && inventory.branchId !== currentUser.branchId) {
      throw new UnauthorizedException('ENCARGADO no puede ver el inventario de otra sucursal');
    }

    return inventory;
  }

  async updateInventory(id: number, updateInventoryDto: UpdateInventoryDto, currentUser: any) {
    const inventory = await this.findOneInventory(id, currentUser); // Handles RBAC and 404

    const newStockMin = updateInventoryDto.stockMin !== undefined ? updateInventoryDto.stockMin : inventory.stockMin;
    const newStockMax = updateInventoryDto.stockMax !== undefined ? updateInventoryDto.stockMax : inventory.stockMax;

    if (newStockMax !== null && newStockMax !== undefined && newStockMin !== undefined) {
      if (newStockMax < newStockMin) {
        throw new BadRequestException('stockMax no puede ser menor a stockMin');
      }
    }

    if (updateInventoryDto.stockMin !== undefined) inventory.stockMin = updateInventoryDto.stockMin;
    if (updateInventoryDto.stockMax !== undefined) inventory.stockMax = updateInventoryDto.stockMax;

    return this.inventoryRepository.save(inventory);
  }

  async removeInventory(id: number, currentUser: any) {
    const inventory = await this.findOneInventory(id, currentUser);

    if (inventory.stock !== 0 || inventory.reserved !== 0) {
      throw new ConflictException('No se puede eliminar un inventario que tiene stock o reservas activas');
    }

    const movementsCount = await this.movementRepository.count({ where: { inventoryId: id } });
    if (movementsCount > 0) {
      throw new ConflictException('No se puede eliminar un inventario que tiene movimientos registrados');
    }

    await this.inventoryRepository.delete(id);
    return { success: true, message: `Inventario ${id} eliminado` };
  }

  async registerMovement(dto: RegisterMovementDto, currentUser: any) {
    const inventory = await this.findOneInventory(dto.inventoryId, currentUser); // Handes RBAC

    if (dto.quantity <= 0 && dto.type !== MovementType.AJUSTE) {
      throw new BadRequestException('La cantidad debe ser mayor a 0 para Entradas y Devoluciones');
    }
    if (dto.type === MovementType.AJUSTE && dto.quantity === 0) {
      throw new BadRequestException('La cantidad de ajuste no puede ser 0');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const invEntity = await queryRunner.manager.findOne(Inventory, {
        where: { id: dto.inventoryId },
        lock: { mode: 'pessimistic_write' }
      });

      if (!invEntity) throw new NotFoundException('Inventario no encontrado durante la transaccin');

      let newStock = invEntity.stock;
      if (dto.type === MovementType.ENTRADA || dto.type === MovementType.DEVOLUCION) {
        newStock += dto.quantity;
      } else if (dto.type === MovementType.AJUSTE) {
        newStock += dto.quantity; // delta can be negative
      } else {
        throw new BadRequestException(`Tipo de movimiento ${dto.type} no soportado manualmente por ahora`);
      }

      if (newStock < 0) {
        throw new BadRequestException('El stock no puede quedar en negativo tras este movimiento');
      }
      
      if (invEntity.reserved > newStock) {
        throw new BadRequestException('Las reservas actuales superan al nuevo stock disponible');
      }

      invEntity.stock = newStock;
      await queryRunner.manager.save(invEntity);

      const movement = queryRunner.manager.create(InventoryMovement, {
        inventory: invEntity,
        type: dto.type,
        quantity: dto.quantity,
        observation: dto.observation,
        user: { id: currentUser.sub } // assuming standard JWT sub = userId
      });
      await queryRunner.manager.save(movement);

      await queryRunner.commitTransaction();
      return invEntity;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // --- SUPPLIER CRUD (Mantenido) ---
  async createSupplier(createSupplierDto: CreateSupplierDto) {
    const existing = await this.supplierRepository.findOneBy({ nit: createSupplierDto.nit });
    if (existing) {
      throw new ConflictException(`Ya existe un proveedor con el NIT ${createSupplierDto.nit}`);
    }
    const supplier = this.supplierRepository.create(createSupplierDto);
    return this.supplierRepository.save(supplier);
  }

  async findAllSuppliers() {
    return this.supplierRepository.find({ order: { id: 'ASC' } });
  }

  async findOneSupplier(id: number) {
    const supplier = await this.supplierRepository.findOneBy({ id });
    if (!supplier) {
      throw new NotFoundException(`Proveedor #${id} no encontrado`);
    }
    return supplier;
  }

  async updateSupplier(id: number, updateSupplierDto: UpdateSupplierDto) {
    const supplier = await this.findOneSupplier(id);
    Object.assign(supplier, updateSupplierDto);
    return this.supplierRepository.save(supplier);
  }

  async removeSupplier(id: number) {
    const supplier = await this.findOneSupplier(id);
    supplier.active = false;
    await this.supplierRepository.save(supplier);
    return { success: true, message: `Proveedor ${id} desactivado` };
  }
}
