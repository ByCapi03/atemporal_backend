import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsPositive, IsString, IsOptional, ValidateNested, ArrayMinSize, IsArray, IsEnum, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ReservationStatus } from '../../common/enums/reservation.enums';

export class ReservationItemDto {
  @IsInt()
  @IsPositive()
  variantId: number;

  @IsInt()
  @IsPositive()
  quantity: number;
}

export class CreateReservationDto {
  @IsInt()
  @IsPositive()
  branchId: number;

  // yyyy-mm-dd
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date: string;

  // HH:MM
  @IsString()
  @IsOptional()
  approximateTime?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReservationItemDto)
  items: ReservationItemDto[];
}

export class UpdateReservationDto {
  @IsEnum(ReservationStatus)
  status: ReservationStatus;
}
