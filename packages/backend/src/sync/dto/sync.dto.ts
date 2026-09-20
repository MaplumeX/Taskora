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

/** Delete Request（ADR-0008）：设备发起的物理删除请求。 */
export class DeleteRequestDto {
  @IsIn(SYNC_ENTITY_VALUES)
  entity!: SyncEntity;

  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class PushRequestDto {
  @IsString()
  deviceId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  events!: OutboxEventDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  deletes?: DeleteRequestDto[];
}
