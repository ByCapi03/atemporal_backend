import { IsNumber, IsPositive, Min, IsOptional, ValidateNested, IsArray, IsIn, IsInt } from 'class-validator';
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

  @IsIn(['EFECTIVO', 'TARJETA', 'QR', 'TRANSFERENCIA'], { message: 'Método de pago no válido para POS' })
  paymentMethod: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosSaleItemDto)
  items: PosSaleItemDto[];
}
