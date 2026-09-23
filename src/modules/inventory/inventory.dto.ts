import { PartialType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional, IsPositive, Min, IsEnum, IsString, IsInt, ValidateIf } from 'class-validator';
import { MovementType } from '../../common/enums/inventory.enums';

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
