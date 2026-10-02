/**
 * Engine 实现的 Project 传输层 — 桌面端完全体（V2 spec，ADR-0007）。
 *
 * Project 的全部读写直接作用于 Local Replica：断网全功能可用；写操作
 * 进 Outbox。领域规则（bucket、计划、完成、Trash 级联、进度计数）来自
 * @taskora/engine 的 domain 纯函数，与 REST 服务共用（local-first-v3
 * issue 04）；排序位次沿 Position（新项目追加末尾）。
 */

import { currentLegacyDateTimeZone, currentTimeZone } from '@/utils/date';
import type { CalendarZones, Engine } from '@taskora/engine';
import {
  countProjectTasks,
  planProjectCreate,
  planProjectRestore,
  planProjectTrash,
  planProjectUpdate,
  positionAfter,
  projectCompletePatch,
  projectReopenPatch,
  repositionMinimal,
} from '@taskora/engine';
import type {
  CreateProjectDto,
  ProjectResponseDto,
  TagResponseDto,
  UpdateProjectDto,
} from '@taskora/shared';

import type { ProjectBackend } from '../api/project-backend';
import { projectRowToDto, tagIndexFor } from './mappers';

function zones(): CalendarZones {
  return { timeZone: currentTimeZone(), legacyDateTimeZone: currentLegacyDateTimeZone() };
}

export interface EngineProjectBackendOptions {
  engine: Engine;
}

export function createEngineProjectBackend(options: EngineProjectBackendOptions): ProjectBackend {
  const { engine } = options;

  const tagIndex = (): Promise<Map<string, TagResponseDto>> => tagIndexFor(engine);

  /** 一批项目的进度计数（一次查询；逐项目各扫一遍是 N 次全表扫描）。 */
  async function projectCountsFor(
    projectIds: string[],
  ): Promise<Map<string, { total: number; completed: number }>> {
    const tasks = await engine.list('task', {
      where: { projectId: { in: projectIds }, trashedAt: null },
    });
    return countProjectTasks(
      projectIds,
      tasks.map((row) => ({
        projectId: row.fields.projectId,
        status: row.fields.status,
        trashedAt: row.fields.trashedAt,
      })),
    );
  }

  async function projectCounts(projectId: string): Promise<{ total: number; completed: number }> {
    return (await projectCountsFor([projectId])).get(projectId)!;
  }

  async function projectDto(id: string): Promise<ProjectResponseDto> {
    const row = await engine.get('project', id);
    if (!row) throw new Error(`Project not found: ${id}`);
    const counts = await projectCounts(id);
    return projectRowToDto(row, await tagIndex(), counts.total, counts.completed);
  }

  return {
    async getProjects(): Promise<ProjectResponseDto[]> {
      const index = await tagIndex();
      const projects = await engine.list('project', { where: { trashedAt: null } });
      const counts = await projectCountsFor(projects.map((row) => row.id));
      return projects.map((row) => {
        const { total, completed } = counts.get(row.id)!;
        return projectRowToDto(row, index, total, completed);
      });
    },

    async getProject(id: string): Promise<ProjectResponseDto> {
      return projectDto(id);
    },

    async createProject(data: CreateProjectDto): Promise<ProjectResponseDto> {
      // 新项目排末尾（Position 追加）
      const existing = await engine.list('project');
      const id = await engine.create('project', {
        ...planProjectCreate(data, zones()),
        position: positionAfter(
          existing,
          existing.length > 0 ? existing[existing.length - 1].id : null,
        ),
      });
      return projectDto(id);
    },

    async updateProject(id: string, data: UpdateProjectDto): Promise<ProjectResponseDto> {
      const existing = await engine.get('project', id);
      if (!existing) throw new Error(`Project not found: ${id}`);
      const f = existing.fields;
      const patch = planProjectUpdate(
        { scheduledType: f.scheduledType, scheduledDate: f.scheduledDate, bucket: f.bucket },
        data,
        zones(),
      );
      await engine.update('project', id, { ...patch });
      return projectDto(id);
    },

    async deleteProject(id: string): Promise<void> {
      const tasks = await engine.list('task', { where: { projectId: id } });
      const plan = planProjectTrash(
        new Date().toISOString(),
        tasks.map((row) => ({ id: row.id, trashedAt: row.fields.trashedAt })),
      );
      await engine.update('project', id, { ...plan.project });
      await engine.updateMany(
        'task',
        plan.tasks.map(({ id: taskId, patch }) => ({ id: taskId, patch: { ...patch } })),
      );
    },

    async restoreProject(id: string): Promise<ProjectResponseDto> {
      const existing = await engine.get('project', id);
      if (!existing) throw new Error(`Project not found: ${id}`);
      const tasks = await engine.list('task', {
        where: { projectId: id, trashedAt: { notNull: true } },
      });
      const plan = planProjectRestore(
        existing.fields.trashedAt,
        tasks.map((row) => ({ id: row.id, trashedAt: row.fields.trashedAt })),
      );
      await engine.update('project', id, { ...plan.project });
      await engine.updateMany(
        'task',
        plan.tasks.map(({ id: taskId, patch }) => ({ id: taskId, patch: { ...patch } })),
      );
      return projectDto(id);
    },

    async completeProject(id: string): Promise<ProjectResponseDto> {
      await engine.update('project', id, { ...projectCompletePatch(new Date().toISOString()) });
      return projectDto(id);
    },

    async uncompleteProject(id: string): Promise<ProjectResponseDto> {
      await engine.update('project', id, { ...projectReopenPatch() });
      return projectDto(id);
    },

    async reorderProjects(orderedIds: string[]): Promise<void> {
      // 只给必须移动的行分配新 Position，一个事务一次通知（同 reorderTasks）
      const rows = await engine.list('project');
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
        'project',
        changes.map(({ id, position }) => ({ id, patch: { position } })),
      );
    },
  };
}
