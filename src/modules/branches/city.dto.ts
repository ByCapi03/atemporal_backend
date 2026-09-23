import { IsString, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateCityDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateCityDto extends PartialType(CreateCityDto) {}
