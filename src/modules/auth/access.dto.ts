import { IsString, IsEmail, IsNotEmpty, IsOptional, IsNumber, IsBoolean, MinLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  roleName: string;

  @IsNumber()
  @IsOptional()
  branchId?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
