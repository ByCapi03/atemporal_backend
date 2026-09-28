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

  @IsNumber()
  @IsOptional()
  collectionId?: number;
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

export class CreateSeasonDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsNotEmpty()
  endDate: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
export class UpdateSeasonDto extends PartialType(CreateSeasonDto) {}

export class CreateCollectionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsNotEmpty()
  seasonId: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
export class UpdateCollectionDto extends PartialType(CreateCollectionDto) {}

export class CreatePromotionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsEnum(['PERCENTAGE', 'FIXED'])
  @IsNotEmpty()
  type: 'PERCENTAGE' | 'FIXED';

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  value: number;

  @IsString()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsNotEmpty()
  endDate: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsNumber({}, { each: true })
  @IsOptional()
  productIds?: number[];
}
export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {}

