import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

import type { SyncEntity } from '@taskora/engine';

export const SYNC_ENTITY_VALUES = [
  'task',
  'subtask',
  'project',
  'project-heading',
  'area',
  'tag',
  'tag-group',
] as const satisfies readonly SyncEntity[];

export class RegisterDeviceDto {
  @IsString()
  deviceId!: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class FieldWriteDto {
  value!: unknown;

  @IsString()
  hlc!: string;
}

export class OutboxEventDto {
  @IsIn(SYNC_ENTITY_VALUES)
  entity!: SyncEntity;

  @IsString()
  id!: string;

  @IsArray()
  fields!: Record<string, FieldWriteDto>;
}

export class PushRequestDto {
  @IsString()
  deviceId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  events!: OutboxEventDto[];
}
