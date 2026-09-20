/**
 * Engine 实现的 Tag 传输层 — 桌面端完全体（V2 spec，ADR-0007）。
 *
 * Tag 增删改全部本地。新建 Tag 排最前（与 REST 时代 sortOrder 同为 0、
 * createdAt desc 的 newest-first 观感一致，Position 插最前）；删除走
 * Delete Request（hub 侧 TaskTag 关联 Cascade 清理）。
 */

import type { Engine } from '@taskora/engine';
import { positionAfter } from '@taskora/engine';
import type { CreateTagDto, TagResponseDto, UpdateTagDto } from '@taskora/shared';

import type { TagBackend } from '../api/tag-backend';
import { tagRowToDto } from './mappers';

export interface EngineTagBackendOptions {
  engine: Engine;
}

export function createEngineTagBackend(options: EngineTagBackendOptions): TagBackend {
  const { engine } = options;

  async function tagDto(id: string): Promise<TagResponseDto> {
    const row = await engine.get('tag', id);
    if (!row) throw new Error(`Tag not found: ${id}`);
    return tagRowToDto(row);
  }

  return {
    async getTags(): Promise<TagResponseDto[]> {
      const tags = await engine.list('tag');
      return tags.map((row) => tagRowToDto(row));
    },

    async getTag(id: string): Promise<TagResponseDto> {
      return tagDto(id);
    },

    async createTag(data: CreateTagDto): Promise<TagResponseDto> {
      const existing = await engine.list('tag');
      const id = await engine.create('tag', {
        title: data.title,
        color: data.color ?? '#3B82F6',
        tagGroupId: data.tagGroupId ?? null,
        // 新 Tag 排最前（newest-first，与 REST 观感一致）
        position: positionAfter(existing, null),
        sortOrder: 0,
      });
      return tagDto(id);
    },

    async updateTag(id: string, data: UpdateTagDto): Promise<TagResponseDto> {
      const patch: Record<string, unknown> = {};
      if (data.title !== undefined) patch.title = data.title;
      if (data.color !== undefined) patch.color = data.color;
      if (data.tagGroupId !== undefined) patch.tagGroupId = data.tagGroupId;
      await engine.update('tag', id, patch);
      return tagDto(id);
    },

    async deleteTag(id: string): Promise<void> {
      await engine.delete('tag', [id]);
    },
  };
}
