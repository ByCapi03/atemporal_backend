import { PartialType } from '@nestjs/mapped-types';
import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsEmail } from 'class-validator';

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
