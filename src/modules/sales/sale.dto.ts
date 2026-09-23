import { PartialType } from '@nestjs/mapped-types';

export class CreateSaleDto {}
export class UpdateSaleDto extends PartialType(CreateSaleDto) {}
