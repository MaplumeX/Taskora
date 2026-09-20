/**
 * Tag 传输层注入点 — local-first 迁移（ADR-0007 / V2 spec）。
 * 注入模式沿用 TaskBackend 已验证的先例（interface + REST 默认 + setter）。
 */

import type { CreateTagDto, TagResponseDto, UpdateTagDto } from '@taskora/shared';

import * as rest from './tags.api.rest';

export interface TagBackend {
  getTags(): Promise<TagResponseDto[]>;
  getTag(id: string): Promise<TagResponseDto>;
  createTag(data: CreateTagDto): Promise<TagResponseDto>;
  updateTag(id: string, data: UpdateTagDto): Promise<TagResponseDto>;
  deleteTag(id: string): Promise<void>;
}

let backend: TagBackend = rest as TagBackend;

/** 注入 Tag 传输层实现（如 Engine）。传 undefined 恢复 REST。 */
export function setTagBackend(implementation: TagBackend | undefined): void {
  backend = implementation ?? (rest as TagBackend);
}

export function currentTagBackend(): TagBackend {
  return backend;
}
