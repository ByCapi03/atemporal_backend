import { PartialType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional, IsPositive, Min, IsEnum, IsString, IsInt, ValidateIf, IsNotEmpty, IsBoolean, IsEmail } from 'class-validator';
import { MovementType } from './inventory.enums';

export class CreateInventoryDto {
  @IsInt()
  @IsPositive()
  branchId: number;

  @IsInt()
  @IsPositive()
  variantId: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  stockMin?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  stockMax?: number;
}

export class UpdateInventoryDto extends PartialType(CreateInventoryDto) {}

export class RegisterMovementDto {
  @IsInt()
  @IsPositive()
  inventoryId: number;

  @IsEnum(MovementType)
  type: MovementType;

  @IsNumber()
  quantity: number;

  @IsString()
  @IsOptional()
  observation?: string;
}

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'El NIT es obligatorio' })
  nit: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
