import { PartialType } from '@nestjs/mapped-types';

export class CreateProductDto {}
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class CreateVariantDto {}
export class UpdateVariantDto extends PartialType(CreateVariantDto) {}

export class CreateCategoryDto {}
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CreateSizeDto {}
export class UpdateSizeDto extends PartialType(CreateSizeDto) {}

export class CreateColorDto {}
export class UpdateColorDto extends PartialType(CreateColorDto) {}
