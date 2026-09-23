import { PartialType } from '@nestjs/mapped-types';

export class CreateInventoryDto {}
export class UpdateInventoryDto extends PartialType(CreateInventoryDto) {}

// Si hubiese CreateInventoryMovementDto, irian aqui tambien
