/**
 * Engine 实现的 Task 传输层 — 桌面端切片一（ADR-0007）。
 *
 * Task/Feed 的全部读写直接作用于 Local Replica：零网络往返、断网全功
 * 能可用；写操作进 Outbox，由调用方（desktop boot）调度 flush/pull 收
 * 敛。语义与 REST 实现对齐（bucket 解析、视图过滤、终态/恢复语义、
 * feed 合并排序），view 口径沿用后端 views.ts / feed.service.ts。
 *
 * 未迁移到 Engine 的 hub 复合操作（convert-to-project）回落 REST，其
 * 变更经 collector → 同步推流到达设备。
 */

import type { Engine, ReplicaRow } from '@taskora/engine';
import { positionAfter, positionsBetween } from '@taskora/engine';
import {
  ProjectStatus,
  ScheduledType,
  TaskStatus,
  TaskBucket,
  ProjectBucket,
} from '@taskora/shared';
import type {
  CreateTaskDto,
  FeedItem,
  FeedView,
  ProjectResponseDto,
  SubtaskResponseDto,
  TagResponseDto,
  TaskFeedItem,
  TaskResponseDto,
  UpdateTaskDto,
} from '@taskora/shared';

import type { TaskBackend, TaskQuery } from '../api/task-backend';
import * as rest from '../api/tasks.api.rest';

const SETTLED_STATUSES = new Set<TaskStatus>([TaskStatus.COMPLETED, TaskStatus.CANCELLED]);

export interface EngineTaskBackendOptions {
  engine: Engine;
}

export function createEngineTaskBackend(options: EngineTaskBackendOptions): TaskBackend {
  const { engine } = options;

  // ---------- 读 ----------

  async function tagIndex(): Promise<Map<string, TagResponseDto>> {
    const tags = await engine.list('tag');
    const index = new Map<string, TagResponseDto>();
    for (const row of tags) {
      index.set(row.id, tagRowToDto(row));
    }
    return index;
  }

  async function subtasksOf(taskId: string): Promise<SubtaskResponseDto[]> {
    const rows = await engine.list('subtask');
    return rows
      .filter((row) => row.fields.taskId === taskId)
      .map((row) => subtaskRowToDto(row));
  }
  async function taskDto(id: string): Promise<TaskResponseDto> {
    const row = await engine.get('task', id);
    if (!row) throw new Error(`Task not found: ${id}`);
    return taskRowToDto(row, await tagIndex());
  }

  return {
    async getTasks(params?: TaskQuery): Promise<TaskResponseDto[]> {
      const rows = await engine.list('task');
      const index = await tagIndex();
      return filterTasks(rows, params).map((row) => taskRowToDto(row, index));
    },

    async getTask(id: string): Promise<TaskResponseDto> {
      const dto = await taskDto(id);
      dto.subtasks = await subtasksOf(id);
      return dto;
    },

    async getFeed(view: FeedView): Promise<FeedItem[]> {
      const index = await tagIndex();
      const taskRows = filterFeedTasks(await engine.list('task'), view);
      const taskItems: TaskFeedItem[] = taskRows.map((row) => {
        const dto = taskRowToDto(row, index);
        return { ...dto, type: 'task' as const, tags: dto.tags ?? [] };
      });

      const includeProjects = ['today', 'upcoming', 'someday', 'logbook', 'trash'].includes(view);
      let projectItems: FeedItem[] = [];
      if (includeProjects) {
        const allTasks = await engine.list('task');
        const projectRows = (await engine.list('project')).filter((row) =>
          projectMatchesView(row, view, new Date()),
        );
        projectItems = projectRows.map((row) => {
          const tasksOf = allTasks.filter((t) => t.fields.projectId === row.id);
          const total = tasksOf.filter((t) => t.fields.trashedAt == null).length;
          const completed = tasksOf.filter(
            (t) => t.fields.trashedAt == null && SETTLED_STATUSES.has(t.fields.status as TaskStatus),
          ).length;
          return projectRowToFeedItem(row, index, total, completed);
        });
      }

      const merged: FeedItem[] = [...taskItems, ...projectItems];
      // 与 feed.service 一致：logbook 按了结时间倒序，其余按列表序
      // （本地 list 已按 Position/sortOrder 语义排序）。
      if (view === 'logbook') {
        merged.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
      }
      return merged;
    },

    // ---------- 写（全部本地，进 Outbox） ----------

    async createTask(data: CreateTaskDto): Promise<TaskResponseDto> {
      const scheduledType = data.scheduledType ?? ScheduledType.NONE;
      const bucket = resolveBucket(
        data.bucket,
        scheduledType,
        data.projectId,
        data.areaId,
      );
      const existing = await engine.list('task');
      const id = await engine.create('task', {
        title: data.title,
        notes: data.notes ?? null,
        scheduledDate:
          scheduledType === ScheduledType.DATE && data.scheduledDate ? data.scheduledDate : null,
        scheduledType,
        dueDate: data.dueDate ?? null,
        bucket,
        status: TaskStatus.ACTIVE,
        settledAt: null,
        trashedAt: null,
        // 新任务插在最前：与 REST 时代「sortOrder 同为 0、createdAt desc」
        // 的 newest-first 观感一致。
        position: positionAfter(existing, null),
        projectId: data.projectId ?? null,
        headingId: null,
        areaId: data.areaId ?? null,
        tagIds: data.tagIds ?? [],
      });
      return taskDto(id);
    },

    async updateTask(id: string, data: UpdateTaskDto): Promise<TaskResponseDto> {
      const existing = await engine.get('task', id);
      if (!existing) throw new Error(`Task not found: ${id}`);
      const fields = existing.fields;

      const newScheduledType =
        data.scheduledType !== undefined ? data.scheduledType : (fields.scheduledType as ScheduledType);

      let effectiveScheduledDate: string | null;
      if (newScheduledType === ScheduledType.SOMEDAY || newScheduledType === ScheduledType.NONE) {
        effectiveScheduledDate = null;
      } else if (data.scheduledDate !== undefined) {
        effectiveScheduledDate = data.scheduledDate ?? null;
      } else {
        effectiveScheduledDate = (fields.scheduledDate as string | null) ?? null;
      }

      const newProjectId = data.projectId !== undefined ? data.projectId : (fields.projectId as string | null);
      const newAreaId = data.areaId !== undefined ? data.areaId : (fields.areaId as string | null);

      let bucket = fields.bucket as TaskBucket;
      if (
        data.scheduledType !== undefined ||
        data.scheduledDate !== undefined ||
        data.projectId !== undefined ||
        data.areaId !== undefined ||
        data.bucket !== undefined
      ) {
        bucket = resolveBucket(
          data.bucket ?? (fields.bucket as TaskBucket),
          newScheduledType,
          newProjectId ?? undefined,
          newAreaId ?? undefined,
        );
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
      if (data.projectId !== undefined) patch.projectId = data.projectId;
      if (data.areaId !== undefined) patch.areaId = data.areaId;
      if (data.tagIds !== undefined) patch.tagIds = data.tagIds;

      await engine.update('task', id, patch);
      return taskDto(id);
    },

    async deleteTask(id: string): Promise<void> {
      await engine.update('task', id, { trashedAt: new Date().toISOString() });
    },

    async restoreTask(id: string): Promise<TaskResponseDto> {
      // 「从垃圾桶捡回」语义：恢复一律回 ACTIVE 并清空了结时间（ADR 0006）。
      await engine.update('task', id, {
        trashedAt: null,
        status: TaskStatus.ACTIVE,
        settledAt: null,
      });
      return taskDto(id);
    },

    async completeTask(id: string): Promise<TaskResponseDto> {
      const existing = await engine.get('task', id);
      if (existing?.fields.status === TaskStatus.COMPLETED) return taskDto(id);
      await engine.update('task', id, {
        status: TaskStatus.COMPLETED,
        settledAt: new Date().toISOString(),
      });
      return taskDto(id);
    },

    async uncompleteTask(id: string): Promise<TaskResponseDto> {
      await engine.update('task', id, { status: TaskStatus.ACTIVE, settledAt: null });
      return taskDto(id);
    },

    async cancelTask(id: string): Promise<TaskResponseDto> {
      // 取消已完成的任务直接改写终态（CONTEXT.md：Cancelled）。
      await engine.update('task', id, {
        status: TaskStatus.CANCELLED,
        settledAt: new Date().toISOString(),
      });
      return taskDto(id);
    },

    async uncancelTask(id: string): Promise<TaskResponseDto> {
      await engine.update('task', id, { status: TaskStatus.ACTIVE, settledAt: null });
      return taskDto(id);
    },

    async reorderTasks(orderedIds: string[]): Promise<void> {
      const rows = await engine.list('task');
      const byId = new Map(rows.map((row) => [row.id, row]));
      // 为整个有序集重新分配等距 Position；与现状相同的行不动（控制
      // Outbox 体积）。
      const keys = positionsBetween(null, null, orderedIds.length);
      await Promise.all(
        orderedIds.map(async (id, index) => {
          const row = byId.get(id);
          if (row && row.fields.position !== keys[index]) {
            await engine.update('task', id, { position: keys[index] });
          }
        }),
      );
    },

    // hub 复合操作：未迁移切片回落 REST（collector → 同步推流到达设备）
    convertTaskToProject(id: string): Promise<ProjectResponseDto> {
      return rest.convertTaskToProject(id);
    },

    // Subtask 与 convert-to-project 同为未迁移切片：回落 REST，变更经
    // collector → 同步推流到达设备。
    createSubtask: rest.createSubtask,
    updateSubtask: rest.updateSubtask,
    deleteSubtask: rest.deleteSubtask,
    completeSubtask: rest.completeSubtask,
    uncompleteSubtask: rest.uncompleteSubtask,
    cancelSubtask: rest.cancelSubtask,
    uncancelSubtask: rest.uncancelSubtask,
    reorderSubtasks: rest.reorderSubtasks,
  };
}

// ---------- 行 → DTO 映射 ----------

function taskRowToDto(row: ReplicaRow, tags: Map<string, TagResponseDto>): TaskResponseDto {
  const f = row.fields;
  const tagIds = Array.isArray(f.tagIds) ? (f.tagIds as string[]) : [];
  return {
    id: row.id,
    title: (f.title as string) ?? '',
    notes: (f.notes as string | null) ?? null,
    scheduledDate: (f.scheduledDate as string | null) ?? null,
    scheduledType: (f.scheduledType as ScheduledType) ?? ScheduledType.NONE,
    dueDate: (f.dueDate as string | null) ?? null,
    bucket: (f.bucket as TaskBucket) ?? TaskBucket.INBOX,
    status: (f.status as TaskStatus) ?? TaskStatus.ACTIVE,
    // DTO 字段名保留 completedAt，承载 Settled At 语义（ADR 0006）。
    completedAt: (f.settledAt as string | null) ?? null,
    trashedAt: (f.trashedAt as string | null) ?? null,
    sortOrder: (f.sortOrder as number) ?? 0,
    projectId: (f.projectId as string | null) ?? null,
    headingId: (f.headingId as string | null) ?? null,
    areaId: (f.areaId as string | null) ?? null,
    tags: tagIds.map((id) => tags.get(id)).filter((t): t is TagResponseDto => t !== undefined),
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
}

function subtaskRowToDto(row: ReplicaRow): SubtaskResponseDto {
  const f = row.fields;
  return {
    id: row.id,
    title: (f.title as string) ?? '',
    status: (f.status as TaskStatus) ?? TaskStatus.ACTIVE,
    completedAt: (f.settledAt as string | null) ?? null,
    sortOrder: (f.sortOrder as number) ?? 0,
    taskId: (f.taskId as string) ?? '',
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
}

function tagRowToDto(row: ReplicaRow): TagResponseDto {
  const f = row.fields;
  return {
    id: row.id,
    title: (f.title as string) ?? '',
    color: (f.color as string) ?? '#3B82F6',
    sortOrder: (f.sortOrder as number) ?? 0,
    tagGroupId: (f.tagGroupId as string | null) ?? null,
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
  };
}

function projectRowToFeedItem(
  row: ReplicaRow,
  tags: Map<string, TagResponseDto>,
  taskTotalCount: number,
  taskCompletedCount: number,
): FeedItem {
  const f = row.fields;
  const tagIds = Array.isArray(f.tagIds) ? (f.tagIds as string[]) : [];
  return {
    id: row.id,
    type: 'project',
    title: (f.title as string) ?? '',
    notes: (f.notes as string | null) ?? null,
    scheduledDate: (f.scheduledDate as string | null) ?? null,
    scheduledType: (f.scheduledType as ScheduledType) ?? ScheduledType.NONE,
    dueDate: (f.dueDate as string | null) ?? null,
    status: (f.status as ProjectStatus) ?? ProjectStatus.ACTIVE,
    bucket: (f.bucket as ProjectBucket) ?? ProjectBucket.ANYTIME,
    completedAt: (f.completedAt as string | null) ?? null,
    trashedAt: (f.trashedAt as string | null) ?? null,
    sortOrder: (f.sortOrder as number) ?? 0,
    areaId: (f.areaId as string | null) ?? null,
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
    tags: tagIds.map((id) => tags.get(id)).filter((t): t is TagResponseDto => t !== undefined),
    taskTotalCount,
    taskCompletedCount,
  };
}

// ---------- 视图过滤（语义对齐 backend views.ts / feed.service.ts） ----------

/** 与 TasksService.resolveBucket 相同的解析逻辑。 */
function resolveBucket(
  bucket: TaskBucket | undefined,
  scheduledType: ScheduledType,
  projectId: string | undefined,
  areaId: string | undefined,
): TaskBucket {
  if (scheduledType === ScheduledType.DATE) return TaskBucket.SCHEDULED;
  if (scheduledType === ScheduledType.SOMEDAY) return TaskBucket.SCHEDULED;
  if (bucket && bucket !== TaskBucket.SCHEDULED) return bucket;
  if (projectId || areaId) return TaskBucket.ANYTIME;
  return TaskBucket.INBOX;
}

function taskMatchesView(row: ReplicaRow, view: TaskQuery['view'], now: Date): boolean {
  const f = row.fields;
  const active = f.status === TaskStatus.ACTIVE;
  switch (view) {
    case 'inbox':
      return f.bucket === TaskBucket.INBOX && active && f.scheduledType === ScheduledType.NONE && f.trashedAt == null;
    case 'today':
      return active && f.scheduledType === ScheduledType.DATE && isDateLte(f.scheduledDate, now) && f.trashedAt == null;
    case 'upcoming':
      return active && f.scheduledType === ScheduledType.DATE && !isDateLte(f.scheduledDate, now) && f.trashedAt == null;
    case 'anytime':
      return f.bucket === TaskBucket.ANYTIME && active && f.scheduledType === ScheduledType.NONE && f.trashedAt == null;
    case 'someday':
      return f.scheduledType === ScheduledType.SOMEDAY && active && f.trashedAt == null;
    case 'trash':
      return f.trashedAt != null;
    case 'logbook':
      return SETTLED_STATUSES.has(f.status as TaskStatus) && f.trashedAt == null;
    default:
      return true;
  }
}

function isDateLte(value: unknown, now: Date): boolean {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime();
}

/** getTasks 过滤（语义对齐 TasksService.findAll）。 */
function filterTasks(rows: ReplicaRow[], params?: TaskQuery): ReplicaRow[] {
  if (!params || Object.keys(params).length === 0) {
    return rows.filter(
      (row) => row.fields.status === TaskStatus.ACTIVE && row.fields.trashedAt == null,
    );
  }
  let filtered = rows;
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter(
      (row) =>
        (typeof row.fields.title === 'string' && row.fields.title.toLowerCase().includes(q)) ||
        (typeof row.fields.notes === 'string' && row.fields.notes.toLowerCase().includes(q)),
    );
  }
  if (params.view) {
    filtered = filtered.filter((row) => taskMatchesView(row, params.view, new Date()));
    return filtered;
  }
  if (params.projectId) filtered = filtered.filter((row) => row.fields.projectId === params.projectId);
  if (params.areaId) filtered = filtered.filter((row) => row.fields.areaId === params.areaId);
  if (params.tagId) {
    filtered = filtered.filter((row) =>
      Array.isArray(row.fields.tagIds) && (row.fields.tagIds as string[]).includes(params.tagId!),
    );
  }
  if (params.hasScheduled === true) {
    filtered = filtered.filter((row) => row.fields.scheduledDate != null);
  }
  if (params.q) {
    filtered = filtered.filter((row) =>
      params.completed
        ? SETTLED_STATUSES.has(row.fields.status as TaskStatus)
        : row.fields.status === TaskStatus.ACTIVE,
    );
    filtered = filtered.filter((row) => row.fields.trashedAt == null);
  } else if (!params.completed) {
    filtered = filtered.filter(
      (row) => row.fields.status === TaskStatus.ACTIVE && row.fields.trashedAt == null,
    );
  } else {
    filtered = filtered.filter((row) => row.fields.trashedAt == null);
  }
  return filtered;
}

/** getFeed 的 task 过滤（buildTaskViewWhere 同语义）。 */
function filterFeedTasks(rows: ReplicaRow[], view: FeedView): ReplicaRow[] {
  return rows.filter((row) => taskMatchesView(row, view, new Date()));
}

function projectMatchesView(row: ReplicaRow, view: FeedView, now: Date): boolean {
  const f = row.fields;
  const active = f.status === ProjectStatus.ACTIVE;
  switch (view) {
    case 'today':
      return active && f.scheduledType === ScheduledType.DATE && isDateLte(f.scheduledDate, now) && f.trashedAt == null;
    case 'upcoming':
      return active && f.scheduledType === ScheduledType.DATE && !isDateLte(f.scheduledDate, now) && f.trashedAt == null;
    case 'someday':
      return f.scheduledType === ScheduledType.SOMEDAY && active && f.trashedAt == null;
    case 'trash':
      return f.trashedAt != null;
    case 'logbook':
      return f.status === ProjectStatus.COMPLETED && f.trashedAt == null;
    default:
      return false; // inbox / anytime 不含 project
  }
}
