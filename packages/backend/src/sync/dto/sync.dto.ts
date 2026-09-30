import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import type { OutboxEvent } from '@taskora/engine';

export class RegisterDeviceDto {
  @IsString()
  deviceId!: string;

  @IsOptional()
  @IsString()
  label?: string;

  /**
   * 同时签发后台凭据（Android 后台同步，local-first-v3 issue 09）：轮换
   * 该设备已有的凭据并续期，明文只在本次响应里出现。
   */
  @IsOptional()
  @IsBoolean()
  backgroundToken?: boolean;
}

/**
 * 注意：fields 是「字段名 → { value, hlc }」的 Record（对象），不是数组；
 * value 是任意 JSON（含 null），只校验外层结构，逐字段语义由 hub 校验。
 * 历史教训（v0.4.1 之前）：fields 误标 @IsArray() 且嵌套缺 @Type，
 * 全局 ValidationPipe（whitelist + forbidNonWhitelisted）会拒绝一切
 * push 请求（400），桌面端 Outbox 永远推不出去，表现为「永久离线」。
 *
 * entity 只校验为字符串（协议 1，local-first-v3 issue 03）：更新版本的
 * 客户端可能推来本 hub 不认识的实体类型，由 hub 逐条拒绝并在响应的
 * rejected 里列出，而不是让整批 400、设备永远重试。
 */
export class OutboxEventDto {
  @IsString()
  entity!: string;

  @IsString()
  id!: string;

  @IsObject()
  fields!: OutboxEvent['fields'];
}

/** Delete Request（ADR-0008）：设备发起的物理删除请求。entity 同上只校验为字符串。 */
export class DeleteRequestDto {
  @IsString()
  entity!: string;

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

/** 按 id 取实体（local-first-v3 issue 08）。entity 同上只校验为字符串。 */
export class FetchEntitiesDto {
  @IsString()
  entity!: string;

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];
}
