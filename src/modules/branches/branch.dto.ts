import { IsString, IsBoolean, IsOptional, IsNotEmpty, IsNumber } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsNumber()
  @IsNotEmpty()
  cityId: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {}
