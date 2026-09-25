/**
 * SALES DTOs
 * Configuración Central: Centraliza las reglas de validación (class-validator) para 
 * todo lo que entra por las peticiones HTTP (Apertura de caja, Ventas POS, Creación 
 * de clientes rápidos, y boilerplate de pagos/ventas).
 */
import { IsNumber, IsPositive, Min, IsOptional, ValidateNested, IsArray, IsIn, IsInt, IsEmail, IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { PaymentMethod } from './sales.enums';
import { Type } from 'class-transformer';

export class OpenCashSessionDto {
  @IsNumber()
  @Min(0, { message: 'El monto de apertura no puede ser negativo' })
  openingAmount: number;
}

export class CloseCashSessionDto {
  @IsNumber()
  @Min(0, { message: 'El monto de cierre no puede ser negativo' })
  closingAmount: number;
}

export class PosSaleItemDto {
  @IsInt()
  @IsPositive()
  variantId: number;

  @IsInt()
  @IsPositive()
  quantity: number;
}

export class CreatePosSaleDto {
  @IsOptional()
  @IsInt()
  clientId?: number;

  @IsEnum(PaymentMethod, { message: 'Método de pago no válido para POS.' })
  paymentMethod: PaymentMethod;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosSaleItemDto)
  items: PosSaleItemDto[];
}

export class CreatePosClientDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio.' })
  lastName: string;

  @IsEmail({}, { message: 'Correo electrónico no válido.' })
  @IsNotEmpty({ message: 'El correo es obligatorio.' })
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class CreatePaymentDto {}
export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {}

export class CreateSaleDto {}
export class UpdateSaleDto extends PartialType(CreateSaleDto) {}
