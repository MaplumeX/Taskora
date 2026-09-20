/**
 * Tag Group 传输层注入点 — local-first 迁移（ADR-0007 / V2 spec）。
 * 注入模式沿用 TaskBackend 已验证的先例（interface + REST 默认 + setter）。
 */

import type { CreateTagGroupDto, TagGroupResponseDto, UpdateTagGroupDto } from '@taskora/shared';

import * as rest from './tag-groups.api.rest';

export interface TagGroupBackend {
  getTagGroups(): Promise<TagGroupResponseDto[]>;
  getTagGroup(id: string): Promise<TagGroupResponseDto>;
  createTagGroup(data: CreateTagGroupDto): Promise<TagGroupResponseDto>;
  updateTagGroup(id: string, data: UpdateTagGroupDto): Promise<TagGroupResponseDto>;
  deleteTagGroup(id: string): Promise<void>;
}

let backend: TagGroupBackend = rest as TagGroupBackend;

/** 注入 Tag Group 传输层实现（如 Engine）。传 undefined 恢复 REST。 */
export function setTagGroupBackend(implementation: TagGroupBackend | undefined): void {
  backend = implementation ?? (rest as TagGroupBackend);
}

export function currentTagGroupBackend(): TagGroupBackend {
  return backend;
}
