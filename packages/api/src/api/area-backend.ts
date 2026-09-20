/**
 * Area 传输层注入点 — local-first 迁移（ADR-0007 / V2 spec）。
 * 注入模式沿用 TaskBackend 已验证的先例（interface + REST 默认 + setter）。
 */

import type { AreaResponseDto, CreateAreaDto, UpdateAreaDto } from '@taskora/shared';

import * as rest from './areas.api.rest';

export interface AreaBackend {
  getAreas(): Promise<AreaResponseDto[]>;
  getArea(id: string): Promise<AreaResponseDto>;
  createArea(data: CreateAreaDto): Promise<AreaResponseDto>;
  updateArea(id: string, data: UpdateAreaDto): Promise<AreaResponseDto>;
  deleteArea(id: string): Promise<void>;
  reorderAreas(orderedIds: string[]): Promise<void>;
}

let backend: AreaBackend = rest as AreaBackend;

/** 注入 Area 传输层实现（如 Engine）。传 undefined 恢复 REST。 */
export function setAreaBackend(implementation: AreaBackend | undefined): void {
  backend = implementation ?? (rest as AreaBackend);
}

export function currentAreaBackend(): AreaBackend {
  return backend;
}
