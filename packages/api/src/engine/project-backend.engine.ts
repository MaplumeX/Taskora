/**
 * Engine 实现的 Project 传输层 — 桌面端完全体（V2 spec，ADR-0007）。
 *
 * Project 的全部读写直接作用于 Local Replica：断网全功能可用；写操作
 * 进 Outbox。视图口径（软删过滤、bucket 解析、完成/恢复语义、计数）
 * 与 ProjectsService 对齐，排序位次沿 Position（新项目追加末尾）。
 */

import type { Engine } from '@taskora/engine';
import { positionAfter, positionsBetween } from '@taskora/engine';
import { ProjectBucket, ProjectStatus, ScheduledType, TaskStatus } from '@taskora/shared';
import type {
  CreateProjectDto,
  ProjectResponseDto,
  TagResponseDto,
  UpdateProjectDto,
} from '@taskora/shared';

import type { ProjectBackend } from '../api/project-backend';
import { projectRowToDto, tagIndexFor, SETTLED_TASK_STATUSES } from './mappers';

export interface EngineProjectBackendOptions {
  engine: Engine;
}

export function createEngineProjectBackend(options: EngineProjectBackendOptions): ProjectBackend {
  const { engine } = options;

  const tagIndex = (): Promise<Map<string, TagResponseDto>> => tagIndexFor(engine);

  /** 项目统计口径：非 trashed task 总数 / 已了结数（与 ProjectsService 一致）。 */
  async function projectCounts(projectId: string): Promise<{ total: number; completed: number }> {
    const tasks = await engine.list('task');
    const own = tasks.filter(
      (row) => row.fields.projectId === projectId && row.fields.trashedAt == null,
    );
    return {
      total: own.length,
      completed: own.filter((row) => SETTLED_TASK_STATUSES.has(row.fields.status as TaskStatus))
        .length,
    };
  }

  async function projectDto(id: string): Promise<ProjectResponseDto> {
    const row = await engine.get('project', id);
    if (!row) throw new Error(`Project not found: ${id}`);
    const counts = await projectCounts(id);
    return projectRowToDto(row, await tagIndex(), counts.total, counts.completed);
  }

  /** 与 ProjectsService.resolveBucket 相同（Project 版：不落 INBOX）。 */
  function resolveBucket(
    bucket: ProjectBucket | undefined,
    scheduledType: ScheduledType,
  ): ProjectBucket {
    if (scheduledType === ScheduledType.DATE) return ProjectBucket.SCHEDULED;
    if (scheduledType === ScheduledType.SOMEDAY) return ProjectBucket.SCHEDULED;
    if (bucket && bucket !== ProjectBucket.SCHEDULED && bucket !== ProjectBucket.INBOX) {
      return bucket;
    }
    return ProjectBucket.ANYTIME;
  }

  return {
    async getProjects(): Promise<ProjectResponseDto[]> {
      const index = await tagIndex();
      const projects = (await engine.list('project')).filter((row) => row.fields.trashedAt == null);
      return Promise.all(
        projects.map(async (row) => {
          const counts = await projectCounts(row.id);
          return projectRowToDto(row, index, counts.total, counts.completed);
        }),
      );
    },

    async getProject(id: string): Promise<ProjectResponseDto> {
      return projectDto(id);
    },

    async createProject(data: CreateProjectDto): Promise<ProjectResponseDto> {
      const scheduledType = data.scheduledType ?? ScheduledType.NONE;
      const existing = await engine.list('project');
      const sortOrder =
        existing.reduce((max, p) => Math.max(max, (p.fields.sortOrder as number) ?? 0), -1) + 1;
      const id = await engine.create('project', {
        title: data.title,
        notes: data.notes ?? null,
        scheduledDate:
          scheduledType === ScheduledType.DATE && data.scheduledDate ? data.scheduledDate : null,
        scheduledType,
        dueDate: data.dueDate ?? null,
        bucket: resolveBucket(data.bucket, scheduledType),
        status: ProjectStatus.ACTIVE,
        completedAt: null,
        trashedAt: null,
        areaId: data.areaId ?? null,
        // 新项目排末尾（与 REST 的 sortOrder = max + 1 同观感）
        position: positionAfter(
          existing,
          existing.length > 0 ? existing[existing.length - 1].id : null,
        ),
        sortOrder,
        tagIds: data.tagIds ?? [],
      });
      return projectDto(id);
    },

    async updateProject(id: string, data: UpdateProjectDto): Promise<ProjectResponseDto> {
      const existing = await engine.get('project', id);
      if (!existing) throw new Error(`Project not found: ${id}`);
      const fields = existing.fields;

      const newScheduledType =
        data.scheduledType !== undefined
          ? data.scheduledType
          : (fields.scheduledType as ScheduledType);

      let effectiveScheduledDate: string | null;
      if (newScheduledType === ScheduledType.SOMEDAY || newScheduledType === ScheduledType.NONE) {
        effectiveScheduledDate = null;
      } else if (data.scheduledDate !== undefined) {
        effectiveScheduledDate = data.scheduledDate ?? null;
      } else {
        effectiveScheduledDate = (fields.scheduledDate as string | null) ?? null;
      }

      let bucket = fields.bucket as ProjectBucket;
      if (
        data.scheduledType !== undefined ||
        data.scheduledDate !== undefined ||
        data.areaId !== undefined ||
        data.bucket !== undefined
      ) {
        bucket = resolveBucket(data.bucket ?? (fields.bucket as ProjectBucket), newScheduledType);
      }

      const patch: Record<string, unknown> = {};
      if (data.title !== undefined) patch.title = data.title;
      if (data.notes !== undefined) patch.notes = data.notes;
      if (data.scheduledType !== undefined || data.scheduledDate !== undefined) {
        patch.scheduledType = newScheduledType;
        patch.scheduledDate = effectiveScheduledDate;
      }
      if (data.dueDate !== undefined) patch.dueDate = data.dueDate;
      if (data.bucket !== undefined || 'scheduledType' in patch) patch.bucket = bucket;
      if (data.areaId !== undefined) patch.areaId = data.areaId;
      if (data.tagIds !== undefined) patch.tagIds = data.tagIds;

      await engine.update('project', id, patch);
      return projectDto(id);
    },

    async deleteProject(id: string): Promise<void> {
      // 软删除级联：Project 与其下 Task 一起进 Trash（与 ProjectsService 一致）
      const now = new Date().toISOString();
      await engine.update('project', id, { trashedAt: now });
      const tasks = await engine.list('task');
      await Promise.all(
        tasks
          .filter((row) => row.fields.projectId === id)
          .map((row) => engine.update('task', row.id, { trashedAt: now })),
      );
    },

    async restoreProject(id: string): Promise<ProjectResponseDto> {
      await engine.update('project', id, { trashedAt: null });
      const tasks = await engine.list('task');
      await Promise.all(
        tasks
          .filter((row) => row.fields.projectId === id)
          .map((row) => engine.update('task', row.id, { trashedAt: null })),
      );
      return projectDto(id);
    },

    async completeProject(id: string): Promise<ProjectResponseDto> {
      await engine.update('project', id, {
        status: ProjectStatus.COMPLETED,
        completedAt: new Date().toISOString(),
      });
      return projectDto(id);
    },

    async uncompleteProject(id: string): Promise<ProjectResponseDto> {
      await engine.update('project', id, { status: ProjectStatus.ACTIVE, completedAt: null });
      return projectDto(id);
    },

    async reorderProjects(orderedIds: string[]): Promise<void> {
      // 为整个有序集重排 Position/sortOrder；未变的行不动（控制 Outbox 体积）
      const keys = positionsBetween(null, null, orderedIds.length);
      const rows = await engine.list('project');
      const byId = new Map(rows.map((row) => [row.id, row]));
      await Promise.all(
        orderedIds.map(async (id, index) => {
          const row = byId.get(id);
          if (!row) return;
          if (row.fields.position !== keys[index] || row.fields.sortOrder !== index) {
            await engine.update('project', id, { position: keys[index], sortOrder: index });
          }
        }),
      );
    },
  };
}
