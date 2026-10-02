/**
 * Engine 实现的 Area 传输层 — 桌面端完全体（V2 spec，ADR-0007）。
 *
 * Area 的增删改/重排全部本地（软引用关系由删除原语按 SetNull 语义
 * 清理）。语义与 AreasService 对齐（新建追加末尾、tagIds 全量 set、
 * 物理删除）。
 */

import { planReorder, positionAtEnd, type Engine } from '@taskora/engine';
import type {
  AreaResponseDto,
  CreateAreaDto,
  TagResponseDto,
  UpdateAreaDto,
} from '@taskora/shared';

import type { AreaBackend } from '../api/area-backend';
import { areaRowToDto, positionedRows, tagIndexFor } from './mappers';

export interface EngineAreaBackendOptions {
  engine: Engine;
}

export function createEngineAreaBackend(options: EngineAreaBackendOptions): AreaBackend {
  const { engine } = options;

  const tagIndex = (): Promise<Map<string, TagResponseDto>> => tagIndexFor(engine);

  async function areaDto(id: string): Promise<AreaResponseDto> {
    const row = await engine.get('area', id);
    if (!row) throw new Error(`Area not found: ${id}`);
    return areaRowToDto(row, await tagIndex());
  }

  return {
    async getAreas(): Promise<AreaResponseDto[]> {
      const index = await tagIndex();
      const areas = await engine.list('area');
      return areas.map((row) => areaRowToDto(row, index));
    },

    async getArea(id: string): Promise<AreaResponseDto> {
      return areaDto(id);
    },

    async createArea(data: CreateAreaDto): Promise<AreaResponseDto> {
      const existing = await engine.list('area');
      // 追加末尾
      const id = await engine.create('area', {
        title: data.title,
        notes: data.notes ?? null,
        position: positionAtEnd(positionedRows(existing)),
        tagIds: data.tagIds ?? [],
      });
      return areaDto(id);
    },

    async updateArea(id: string, data: UpdateAreaDto): Promise<AreaResponseDto> {
      const patch: Record<string, unknown> = {};
      if (data.title !== undefined) patch.title = data.title;
      if (data.notes !== undefined) patch.notes = data.notes;
      if (data.tagIds !== undefined) patch.tagIds = data.tagIds;
      await engine.update('area', id, patch);
      return areaDto(id);
    },

    async deleteArea(id: string): Promise<void> {
      // 物理删除（Delete Request，ADR-0008）；副本侧对 Task/Project 的
      // areaId 引用按 SetNull 语义清理，与 hub 侧 onDelete: SetNull 一致。
      await engine.delete('area', [id]);
    },

    async reorderAreas(orderedIds: string[]): Promise<void> {
      // 只给必须移动的行分配新 Position，一个事务一次通知（同 reorderProjects）
      const rows = await engine.list('area');
      await engine.updateMany(
        'area',
        planReorder(positionedRows(rows), orderedIds).map(({ id, patch }) => ({
          id,
          patch: { ...patch },
        })),
      );
    },
  };
}
