import type { CreateTagGroupDto, TagGroupResponseDto, UpdateTagGroupDto } from '@taskora/shared';

import { currentTagGroupBackend } from './tag-group-backend';

/**
 * Tag Group API 门面 — 数据源随 TaskBackend 同一注入模式切换（V2 spec）：
 * 默认 REST（web），桌面端登录装配时切到 Local Replica。
 */
export function getTagGroups(): Promise<TagGroupResponseDto[]> {
  return currentTagGroupBackend().getTagGroups();
}

export function getTagGroup(id: string): Promise<TagGroupResponseDto> {
  return currentTagGroupBackend().getTagGroup(id);
}

export function createTagGroup(data: CreateTagGroupDto): Promise<TagGroupResponseDto> {
  return currentTagGroupBackend().createTagGroup(data);
}

export function updateTagGroup(id: string, data: UpdateTagGroupDto): Promise<TagGroupResponseDto> {
  return currentTagGroupBackend().updateTagGroup(id, data);
}

export function deleteTagGroup(id: string): Promise<void> {
  return currentTagGroupBackend().deleteTagGroup(id);
}
