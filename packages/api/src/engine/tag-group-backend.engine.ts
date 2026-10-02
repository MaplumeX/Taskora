/**
 * Engine 实现的 Tag Group 传输层 — 桌面端完全体（V2 spec，ADR-0007）。
 *
 * Tag Group 增删改全部本地。删除走 Delete Request；副本侧成员 Tag 的
 * tagGroupId 引用按 SetNull 语义清理（与 hub 侧 onDelete: SetNull 一致）。
 */

import { planReorder, positionAtStart, type Engine } from '@taskora/engine';
import type { CreateTagGroupDto, TagGroupResponseDto, UpdateTagGroupDto } from '@taskora/shared';

import type { TagGroupBackend } from '../api/tag-group-backend';
import { positionedRows, tagGroupRowToDto, tagRowToDto } from './mappers';

export interface EngineTagGroupBackendOptions {
  engine: Engine;
}

export function createEngineTagGroupBackend(
  options: EngineTagGroupBackendOptions,
): TagGroupBackend {
  const { engine } = options;

  async function membersOf(groupId: string) {
    const tags = await engine.list('tag', { where: { tagGroupId: groupId } });
    return tags.map((row) => tagRowToDto(row));
  }

  async function groupDto(id: string): Promise<TagGroupResponseDto> {
    const row = await engine.get('tag-group', id);
    if (!row) throw new Error(`TagGroup not found: ${id}`);
    return tagGroupRowToDto(row, await membersOf(id));
  }

  return {
    async getTagGroups(): Promise<TagGroupResponseDto[]> {
      const groups = await engine.list('tag-group');
      return Promise.all(groups.map((row) => groupDto(row.id)));
    },

    async getTagGroup(id: string): Promise<TagGroupResponseDto> {
      return groupDto(id);
    },

    async createTagGroup(data: CreateTagGroupDto): Promise<TagGroupResponseDto> {
      // 新建排最前
      const existing = await engine.list('tag-group');
      const id = await engine.create('tag-group', {
        title: data.title,
        position: positionAtStart(positionedRows(existing)),
      });
      return groupDto(id);
    },

    async updateTagGroup(id: string, data: UpdateTagGroupDto): Promise<TagGroupResponseDto> {
      const patch: Record<string, unknown> = {};
      if (data.title !== undefined) patch.title = data.title;
      await engine.update('tag-group', id, patch);
      return groupDto(id);
    },

    async deleteTagGroup(id: string): Promise<void> {
      await engine.delete('tag-group', [id]);
    },

    async reorderTagGroups(orderedIds: string[]): Promise<void> {
      const rows = await engine.list('tag-group');
      await engine.updateMany(
        'tag-group',
        planReorder(positionedRows(rows), orderedIds).map(({ id, patch }) => ({
          id,
          patch: { ...patch },
        })),
      );
    },
  };
}
