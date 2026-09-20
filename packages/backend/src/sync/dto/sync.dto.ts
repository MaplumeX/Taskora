import { IsArray, IsIn, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import type { SyncEntity, OutboxEvent, DeleteRequest } from '@taskora/engine';

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

/**
 * 注意：fields 是「字段名 → { value, hlc }」的 Record（对象），不是数组；
 * value 是任意 JSON（含 null），只校验外层结构，逐字段语义由 hub 校验。
 * 历史教训（v0.4.1 之前）：fields 误标 @IsArray() 且嵌套缺 @Type，
 * 全局 ValidationPipe（whitelist + forbidNonWhitelisted）会拒绝一切
 * push 请求（400），桌面端 Outbox 永远推不出去，表现为「永久离线」。
 */
export class OutboxEventDto {
  @IsIn(SYNC_ENTITY_VALUES)
  entity!: SyncEntity;

  @IsString()
  id!: string;

  @IsObject()
  fields!: OutboxEvent['fields'];
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
  @Type(() => OutboxEventDto)
  events!: OutboxEventDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeleteRequestDto)
  deletes?: DeleteRequestDto[];
}
