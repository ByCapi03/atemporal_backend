import { PartialType } from '@nestjs/mapped-types';

export class CreatePaymentDto {}
export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {}
