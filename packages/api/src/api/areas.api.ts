import type { AreaResponseDto, CreateAreaDto, UpdateAreaDto } from '@taskora/shared';

import { currentAreaBackend } from './area-backend';

/**
 * Area API 门面 — 数据源随 TaskBackend 同一注入模式切换（V2 spec）：
 * 默认 REST（web），桌面端登录装配时切到 Local Replica。
 */
export function getAreas(): Promise<AreaResponseDto[]> {
  return currentAreaBackend().getAreas();
}

export function getArea(id: string): Promise<AreaResponseDto> {
  return currentAreaBackend().getArea(id);
}

export function createArea(data: CreateAreaDto): Promise<AreaResponseDto> {
  return currentAreaBackend().createArea(data);
}

export function updateArea(id: string, data: UpdateAreaDto): Promise<AreaResponseDto> {
  return currentAreaBackend().updateArea(id, data);
}

export function deleteArea(id: string): Promise<void> {
  return currentAreaBackend().deleteArea(id);
}

export function reorderAreas(orderedIds: string[]): Promise<void> {
  return currentAreaBackend().reorderAreas(orderedIds);
}
