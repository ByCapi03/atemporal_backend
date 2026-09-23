import { PartialType } from '@nestjs/mapped-types';

export class CreateSupplierDto {}
export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
