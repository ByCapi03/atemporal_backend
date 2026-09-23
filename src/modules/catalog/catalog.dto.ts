import { PartialType } from '@nestjs/mapped-types';
import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsNumber, IsDecimal, IsPositive, IsEnum } from 'class-validator';
import { ArGarmentType } from './product.entity';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la categora es obligatorio' })
  name: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CreateSizeDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la talla es obligatorio' })
  name: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
export class UpdateSizeDto extends PartialType(CreateSizeDto) {}

export class CreateColorDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del color es obligatorio' })
  name: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
export class UpdateColorDto extends PartialType(CreateColorDto) {}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del producto es obligatorio' })
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'El precio debe ser positivo' })
  price: number;

  @IsNumber()
  @IsPositive()
  categoryId: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsBoolean()
  @IsOptional()
  arEnabled?: boolean;

  @IsEnum(ArGarmentType)
  @IsOptional()
  arType?: ArGarmentType;
}
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty({ message: 'El SKU es obligatorio' })
  sku: string;

  @IsNumber()
  @IsPositive()
  productId: number;

  @IsNumber()
  @IsPositive()
  sizeId: number;

  @IsNumber()
  @IsPositive()
  colorId: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
export class UpdateVariantDto extends PartialType(CreateVariantDto) {}
