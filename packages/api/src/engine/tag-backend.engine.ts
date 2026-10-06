/**
 * Engine 实现的 Tag 传输层 — 桌面端完全体（V2 spec，ADR-0007）。
 *
 * Tag 增删改全部本地。新建 Tag 排最前（newest-first：Position 插最前）；
 * 删除走 Delete Request（hub 侧 TaskTag 关联 Cascade 清理）。
 */

import type { Engine } from '@taskora/engine';
import { positionAfter, repositionMinimal, tagParentCreatesCycle } from '@taskora/engine';
import type { CreateTagDto, TagResponseDto, UpdateTagDto } from '@taskora/shared';

import type { TagBackend } from '../api/tag-backend';
import { tagRowToDto } from './mappers';

export interface EngineTagBackendOptions {
  engine: Engine;
}

export function createEngineTagBackend(options: EngineTagBackendOptions): TagBackend {
  const { engine } = options;

  /**
   * 父 Tag 必须存在，且不能让树成环（嵌套 Tag，ADR-0016；与 REST 同口径）。
   * 并发写出的环由 hub 合并后修复。
   */
  async function assertParent(id: string | null, parentId: string | null | undefined) {
    if (parentId == null) return;
    const rows = await engine.list('tag');
    const parents = new Map(
      rows.map((row) => [
        row.id,
        typeof row.fields.parentId === 'string' ? row.fields.parentId : null,
      ]),
    );
    if (!parents.has(parentId)) throw new Error(`Parent tag not found: ${parentId}`);
    if (id !== null && tagParentCreatesCycle(id, parentId, (tagId) => parents.get(tagId))) {
      throw new Error('A tag cannot be nested inside itself or its descendants');
    }
  }

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
      await assertParent(null, data.parentId);
      const existing = await engine.list('tag');
      const id = await engine.create('tag', {
        title: data.title,
        color: data.color ?? '#3B82F6',
        parentId: data.parentId ?? null,
        // 新 Tag 排最前（newest-first）
        position: positionAfter(existing, null),
      });
      return tagDto(id);
    },

    async updateTag(id: string, data: UpdateTagDto): Promise<TagResponseDto> {
      await assertParent(id, data.parentId);
      const patch: Record<string, unknown> = {};
      if (data.title !== undefined) patch.title = data.title;
      if (data.color !== undefined) patch.color = data.color;
      if (data.parentId !== undefined) patch.parentId = data.parentId;
      await engine.update('tag', id, patch);
      return tagDto(id);
    },

    async deleteTag(id: string): Promise<void> {
      await engine.delete('tag', [id]);
    },

    async reorderTags(orderedIds: string[]): Promise<void> {
      // 只给必须移动的行分配新 Position（同 reorderProjects）
      const rows = await engine.list('tag');
      const byId = new Map(rows.map((row) => [row.id, row]));
      const changes = repositionMinimal(
        orderedIds.flatMap((id) => {
          const row = byId.get(id);
          if (!row) return [];
          const position = row.fields.position;
          return [{ id, position: typeof position === 'string' ? position : null }];
        }),
      );
      await engine.updateMany(
        'tag',
        changes.map(({ id, position }) => ({ id, patch: { position } })),
      );
    },
  };
}
