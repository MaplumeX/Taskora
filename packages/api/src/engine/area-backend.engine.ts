/**
 * Engine 实现的 Area 传输层 — 桌面端完全体（V2 spec，ADR-0007）。
 *
 * Area 的增删改/重排全部本地（软引用关系由删除原语按 SetNull 语义
 * 清理）。语义与 AreasService 对齐（新建追加末尾、tagIds 全量 set、
 * 物理删除且其下项目与任务进 Trash）。
 */

import {
  planAreaDelete,
  planMarkReviewed,
  planReorder,
  planReviewSchedule,
  planReviewUpdate,
  positionAtEnd,
  type Engine,
} from '@taskora/engine';
import type {
  AreaResponseDto,
  CreateAreaDto,
  TagResponseDto,
  UpdateAreaDto,
} from '@taskora/shared';

import { currentLegacyDateTimeZone, currentReviewContext, currentTimeZone } from '@/utils/date';
import type { AreaBackend } from '../api/area-backend';
import { areaRowToDto, positionedRows, tagIndexFor } from './mappers';

function zones() {
  return { timeZone: currentTimeZone(), legacyDateTimeZone: currentLegacyDateTimeZone() };
}

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
        ...planReviewSchedule(currentReviewContext(), 'area', data, zones()),
      });
      return areaDto(id);
    },

    async updateArea(id: string, data: UpdateAreaDto): Promise<AreaResponseDto> {
      const existing = await engine.get('area', id);
      if (!existing) throw new Error(`Area not found: ${id}`);
      const patch: Record<string, unknown> = {};
      if (data.title !== undefined) patch.title = data.title;
      if (data.notes !== undefined) patch.notes = data.notes;
      if (data.tagIds !== undefined) patch.tagIds = data.tagIds;
      Object.assign(
        patch,
        planReviewUpdate(existing.fields, data, 'area', currentReviewContext(), zones()),
      );
      await engine.update('area', id, patch);
      return areaDto(id);
    },

    async deleteArea(id: string): Promise<void> {
      // 其下项目与任务先进 Trash（规则见 domain planAreaDelete）
      const projects = await engine.list('project', { where: { areaId: id } });
      const [directTasks, projectTasks] = await Promise.all([
        engine.list('task', { where: { areaId: id } }),
        engine.list('task', { where: { projectId: { in: projects.map((row) => row.id) } } }),
      ]);
      const tasks = new Map([...directTasks, ...projectTasks].map((row) => [row.id, row]));
      const plan = planAreaDelete(
        new Date().toISOString(),
        projects.map((row) => ({ id: row.id, trashedAt: row.fields.trashedAt })),
        [...tasks.values()].map((row) => ({
          id: row.id,
          projectId: row.fields.projectId,
          trashedAt: row.fields.trashedAt,
        })),
      );
      await engine.updateMany(
        'project',
        plan.projects.map(({ id: projectId, patch }) => ({ id: projectId, patch: { ...patch } })),
      );
      await engine.updateMany(
        'task',
        plan.tasks.map(({ id: taskId, patch }) => ({ id: taskId, patch: { ...patch } })),
      );
      // 区域本身物理删除（Delete Request，ADR-0008）；副本侧对 Task/Project 的
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

    async markAreaReviewed(id: string): Promise<AreaResponseDto> {
      const existing = await engine.get('area', id);
      if (!existing) throw new Error(`Area not found: ${id}`);
      await engine.update('area', id, {
        ...planMarkReviewed(existing.fields, 'area', currentReviewContext()),
      });
      return areaDto(id);
    },
  };
}
