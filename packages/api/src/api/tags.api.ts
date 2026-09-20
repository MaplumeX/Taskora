import type { CreateTagDto, TagResponseDto, UpdateTagDto } from '@taskora/shared';

import { currentTagBackend } from './tag-backend';

/**
 * Tag API 门面 — 数据源随 TaskBackend 同一注入模式切换（V2 spec）：
 * 默认 REST（web），桌面端登录装配时切到 Local Replica。
 */
export function getTags(): Promise<TagResponseDto[]> {
  return currentTagBackend().getTags();
}

export function getTag(id: string): Promise<TagResponseDto> {
  return currentTagBackend().getTag(id);
}

export function createTag(data: CreateTagDto): Promise<TagResponseDto> {
  return currentTagBackend().createTag(data);
}

export function updateTag(id: string, data: UpdateTagDto): Promise<TagResponseDto> {
  return currentTagBackend().updateTag(id, data);
}

export function deleteTag(id: string): Promise<void> {
  return currentTagBackend().deleteTag(id);
}
