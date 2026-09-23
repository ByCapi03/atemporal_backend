import { IsNumber, IsPositive, Min, IsOptional, ValidateNested, IsArray, IsIn, IsInt, IsEmail, IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { PaymentMethod } from '../../common/enums/sales.enums';
import { Type } from 'class-transformer';

export class OpenCashSessionDto {
  @IsNumber()
  @Min(0, { message: 'El monto de apertura no puede ser negativo' })
  openingAmount: number;
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
