/**
 * Engine 实现的 Task 传输层 — 桌面端完全体（ADR-0007 / ADR-0008）。
 *
 * Task/Feed/Subtask 的全部读写直接作用于 Local Replica：零网络往返、
 * 断网全功能可用；写操作进 Outbox，由调用方（desktop boot）调度
 * flush/pull 收敛。convert-to-project 分解为普通字段写（新 Project、
 * Subtask 提升为 Task）+ 原 Task 的 Delete Request；emptyTrash 复用
 * 同一删除原语。语义与 REST 实现对齐（bucket 解析、视图过滤、终态/
 * 恢复语义、feed 合并排序），view 口径沿用后端 views.ts /
 * feed.service.ts / tasks.service.ts / subtasks.service.ts。
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
  CreateSubtaskDto,
  CreateTaskDto,
  FeedItem,
  FeedView,
  ProjectResponseDto,
  SubtaskResponseDto,
  TagResponseDto,
  TaskFeedItem,
  TaskResponseDto,
  UpdateSubtaskDto,
  UpdateTaskDto,
} from '@taskora/shared';

import type { TaskBackend, TaskQuery } from '../api/task-backend';
import {
  SETTLED_TASK_STATUSES as SETTLED_STATUSES,
  projectRowToDto,
  subtaskRowToDto,
  tagIndexFor,
  taskRowToDto,
} from './mappers';

export interface EngineTaskBackendOptions {
  engine: Engine;
}

export function createEngineTaskBackend(options: EngineTaskBackendOptions): TaskBackend {
  const { engine } = options;

  // ---------- 读 ----------

  const tagIndex = (): Promise<Map<string, TagResponseDto>> => tagIndexFor(engine);

  async function subtasksOf(taskId: string): Promise<SubtaskResponseDto[]> {
    const rows = await engine.list('subtask');
    return rows.filter((row) => row.fields.taskId === taskId).map((row) => subtaskRowToDto(row));
  }
  async function taskDto(id: string): Promise<TaskResponseDto> {
    const row = await engine.get('task', id);
    if (!row) throw new Error(`Task not found: ${id}`);
    return taskRowToDto(row, await tagIndex());
  }
  async function subtaskDto(id: string): Promise<SubtaskResponseDto> {
    const row = await engine.get('subtask', id);
    if (!row) throw new Error(`Subtask not found: ${id}`);
    return subtaskRowToDto(row);
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
      const allTasks = await engine.list('task');
      const taskItems: TaskFeedItem[] = filterFeedTasks(allTasks, view).map((row) => {
        const dto = taskRowToDto(row, index);
        return { ...dto, type: 'task' as const, tags: dto.tags ?? [] };
      });

      const includeProjects = ['today', 'upcoming', 'someday', 'logbook', 'trash'].includes(view);
      let projectItems: FeedItem[] = [];
      if (includeProjects) {
        const projectRows = (await engine.list('project')).filter((row) =>
          projectMatchesView(row, view, new Date()),
        );
        projectItems = projectRows.map((row) => {
          const tasksOf = allTasks.filter((t) => t.fields.projectId === row.id);
          const total = tasksOf.filter((t) => t.fields.trashedAt == null).length;
          const completed = tasksOf.filter(
            (t) =>
              t.fields.trashedAt == null && SETTLED_STATUSES.has(t.fields.status as TaskStatus),
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
      const bucket = resolveBucket(data.bucket, scheduledType, data.projectId, data.areaId);
      const existing = await engine.list('task');
      const id = await engine.create('task', {
        title: data.title,
        notes: data.notes ?? null,
        scheduledDate:
          scheduledType === ScheduledType.DATE && data.scheduledDate ? data.scheduledDate : null,
        scheduledType,
        reminderTime: null,
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

      const newProjectId =
        data.projectId !== undefined ? data.projectId : (fields.projectId as string | null);
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
      // Reminder 清理规则（reminders spec）：ScheduledType 离开 DATE 时
      // 一律清除提醒，防止残留提醒在 Someday/NONE 任务上到期触发；
      // 换日期（DATE → DATE）保留 reminderTime 不变（同一天同一时刻新一天）。
      if (newScheduledType !== ScheduledType.DATE) {
        patch.reminderTime = null;
      } else if (data.reminderTime !== undefined) {
        patch.reminderTime = data.reminderTime;
      }
      if (data.dueDate !== undefined) patch.dueDate = data.dueDate;
      if (data.bucket !== undefined || 'scheduledType' in patch) patch.bucket = bucket;
      if (data.projectId !== undefined) patch.projectId = data.projectId;
      if (data.areaId !== undefined) patch.areaId = data.areaId;
      if (data.tagIds !== undefined) patch.tagIds = data.tagIds;
      // 与 REST 对齐：projectId 变化时解除 heading 归属（TasksService.update
      // 的 heading disconnect），否则任务换项目后 headingId 仍指旧项目的
      // 分组，移回原项目时会突然重新出现在旧分组下。
      if (
        data.projectId !== undefined &&
        data.projectId !== (fields.projectId as string | null) &&
        fields.headingId != null
      ) {
        patch.headingId = null;
      }

      await engine.update('task', id, patch);
      return taskDto(id);
    },

    async deleteTask(id: string): Promise<void> {
      // 移入 Trash 清除提醒（reminders spec）：被丢弃的工作不再通知。
      await engine.update('task', id, { trashedAt: new Date().toISOString(), reminderTime: null });
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
      // 了结清除提醒（reminders spec）：已完成/取消的工作不再通知。
      await engine.update('task', id, {
        status: TaskStatus.COMPLETED,
        settledAt: new Date().toISOString(),
        reminderTime: null,
      });
      return taskDto(id);
    },

    async uncompleteTask(id: string): Promise<TaskResponseDto> {
      await engine.update('task', id, { status: TaskStatus.ACTIVE, settledAt: null });
      return taskDto(id);
    },

    async cancelTask(id: string): Promise<TaskResponseDto> {
      // 取消已完成的任务直接改写终态（CONTEXT.md：Cancelled）。
      // 了结清除提醒（reminders spec）：已完成/取消的工作不再通知。
      await engine.update('task', id, {
        status: TaskStatus.CANCELLED,
        settledAt: new Date().toISOString(),
        reminderTime: null,
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
      // Outbox 体积）。position 供本地副本读（fractional indexing），
      // sortOrder 供过渡期 web 端 REST 读——两个排序键必须一起写
      // （对齐 reorderProjects 惯例），否则两端顺序分叉。
      const keys = positionsBetween(null, null, orderedIds.length);
      await Promise.all(
        orderedIds.map(async (id, index) => {
          const row = byId.get(id);
          if (row && (row.fields.position !== keys[index] || row.fields.sortOrder !== index)) {
            await engine.update('task', id, { position: keys[index], sortOrder: index });
          }
        }),
      );
    },

    // ---------- Subtask CRUD（全部本地，进 Outbox） ----------

    async createSubtask(taskId: string, data: CreateSubtaskDto): Promise<SubtaskResponseDto> {
      const task = await engine.get('task', taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);
      // sortOrder = max + 1（与 SubtasksService 一致：追加在末尾）
      const existing = await subtasksOf(taskId);
      const sortOrder = existing.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1;
      const id = await engine.create('subtask', {
        title: data.title,
        taskId,
        sortOrder,
        status: TaskStatus.ACTIVE,
        settledAt: null,
      });
      return subtaskDto(id);
    },

    async updateSubtask(id: string, data: UpdateSubtaskDto): Promise<SubtaskResponseDto> {
      const existing = await engine.get('subtask', id);
      if (!existing) throw new Error(`Subtask not found: ${id}`);
      const patch: Record<string, unknown> = {};
      if (data.title !== undefined) patch.title = data.title;
      if (data.status !== undefined) {
        patch.status = data.status;
        // 终态刷新了结时间，非终态清空（与 SubtasksService 一致）
        patch.settledAt = SETTLED_STATUSES.has(data.status) ? new Date().toISOString() : null;
      }
      await engine.update('subtask', id, patch);
      return subtaskDto(id);
    },

    async deleteSubtask(id: string): Promise<void> {
      await engine.delete('subtask', [id]);
    },

    async completeSubtask(id: string): Promise<SubtaskResponseDto> {
      await engine.update('subtask', id, {
        status: TaskStatus.COMPLETED,
        settledAt: new Date().toISOString(),
      });
      return subtaskDto(id);
    },

    async uncompleteSubtask(id: string): Promise<SubtaskResponseDto> {
      await engine.update('subtask', id, { status: TaskStatus.ACTIVE, settledAt: null });
      return subtaskDto(id);
    },

    async cancelSubtask(id: string): Promise<SubtaskResponseDto> {
      await engine.update('subtask', id, {
        status: TaskStatus.CANCELLED,
        settledAt: new Date().toISOString(),
      });
      return subtaskDto(id);
    },

    async uncancelSubtask(id: string): Promise<SubtaskResponseDto> {
      await engine.update('subtask', id, { status: TaskStatus.ACTIVE, settledAt: null });
      return subtaskDto(id);
    },

    async reorderSubtasks(taskId: string, orderedIds: string[]): Promise<void> {
      await Promise.all(
        orderedIds.map(async (id, index) => {
          const row = await engine.get('subtask', id);
          // 与 reorderTasks 同惯例：顺序未变的行不动，控制 Outbox 体积
          if (row && row.fields.taskId === taskId && row.fields.sortOrder !== index) {
            await engine.update('subtask', id, { sortOrder: index });
          }
        }),
      );
    },

    // ---------- hub 复合操作的 Engine 分解（ADR-0008） ----------

    /**
     * convert-to-project 全离线分解：新 Project 创建、Subtask 逐条提升
     * 为完整 Task（继承标题/状态/了结时间，落位 INBOX）全部是普通字段
     * 写（走 LWW）；原 Task 的消失是一个 Delete Request（级联其
     * Subtask）。语义与 TasksService.convertToProject 对齐（终态映射、
     * areaId 回退、标签继承、排序位次）。
     */
    async convertTaskToProject(id: string): Promise<ProjectResponseDto> {
      const task = await engine.get('task', id);
      if (!task) throw new Error(`Task not found: ${id}`);
      const f = task.fields;

      // areaId 回退：Task 的 areaId → 父 Project 的 areaId
      let effectiveAreaId = (f.areaId as string | null) ?? null;
      if (effectiveAreaId === null && typeof f.projectId === 'string') {
        const parent = await engine.get('project', f.projectId);
        effectiveAreaId = (parent?.fields.areaId as string | null) ?? null;
      }

      // 新 Project 排在末尾（sortOrder = max + 1，Position 追加）
      const projects = await engine.list('project');
      const nextSortOrder =
        projects.reduce((max, p) => Math.max(max, (p.fields.sortOrder as number) ?? 0), -1) + 1;
      const position = positionAfter(
        projects,
        projects.length > 0 ? projects[projects.length - 1].id : null,
      );

      const status =
        f.status === TaskStatus.COMPLETED ? ProjectStatus.COMPLETED : ProjectStatus.ACTIVE;
      // Project 无 CANCELLED 终态（out of scope）：仅完成任务携带了结时间。
      const completedAt =
        f.status === TaskStatus.COMPLETED ? ((f.settledAt as string | null) ?? null) : null;
      const tagIds = Array.isArray(f.tagIds) ? (f.tagIds as string[]) : [];

      const projectId = await engine.create('project', {
        title: (f.title as string) ?? '',
        notes: (f.notes as string | null) ?? null,
        scheduledDate: (f.scheduledDate as string | null) ?? null,
        dueDate: (f.dueDate as string | null) ?? null,
        scheduledType: (f.scheduledType as ScheduledType) ?? ScheduledType.NONE,
        status,
        completedAt,
        trashedAt: (f.trashedAt as string | null) ?? null,
        areaId: effectiveAreaId,
        bucket: (f.bucket as ProjectBucket) ?? ProjectBucket.ANYTIME,
        position,
        sortOrder: nextSortOrder,
        tagIds,
      });

      // Subtask 提升为完整 Task（继承标题/状态/了结时间，落位 INBOX）。
      // 与 REST 同口径：逐条 create、排最前（createdAt desc 观感一致）。
      const subtasks = (await engine.list('subtask')).filter((row) => row.fields.taskId === id);
      const allTasks = await engine.list('task');
      for (const subtask of subtasks) {
        const sf = subtask.fields;
        await engine.create('task', {
          title: (sf.title as string) ?? '',
          notes: null,
          scheduledDate: null,
          dueDate: null,
          scheduledType: ScheduledType.NONE,
          bucket: TaskBucket.INBOX,
          status: (sf.status as TaskStatus) ?? TaskStatus.ACTIVE,
          settledAt: (sf.settledAt as string | null) ?? null,
          trashedAt: null,
          position: positionAfter(allTasks, null),
          projectId,
          headingId: null,
          areaId: null,
          tagIds: [],
        });
      }

      // 原 Task 的消失：Delete Request（级联其 Subtask；不在 Trash 留尸体）
      await engine.delete('task', [id]);

      const index = await tagIndex();
      const project = await engine.get('project', projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      return projectRowToDto(project, index, 0, 0);
    },

    /**
     * emptyTrash 复用 Delete Request（ADR-0008）：收集 Trash 内的
     * Task/Project id（含 trashed Project 下属 Task，与 FeedService 同
     * 口径），批量物理删除；断网可用，联网后收敛。
     */
    async emptyTrash(): Promise<{ deletedTasks: number; deletedProjects: number }> {
      const projects = await engine.list('project');
      const trashedProjectIds = new Set(
        projects.filter((row) => row.fields.trashedAt != null).map((row) => row.id),
      );
      const tasks = await engine.list('task');
      const taskIds = tasks
        .filter(
          (row) =>
            row.fields.trashedAt != null ||
            (typeof row.fields.projectId === 'string' &&
              trashedProjectIds.has(row.fields.projectId)),
        )
        .map((row) => row.id);

      await engine.delete('task', taskIds);
      await engine.delete('project', [...trashedProjectIds]);
      return { deletedTasks: taskIds.length, deletedProjects: trashedProjectIds.size };
    },
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
    reminderTime: null, // Project 不设 Reminder（CONTEXT.md）
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
      return (
        f.bucket === TaskBucket.INBOX &&
        active &&
        f.scheduledType === ScheduledType.NONE &&
        f.trashedAt == null
      );
    case 'today':
      return (
        active &&
        f.scheduledType === ScheduledType.DATE &&
        isDateLte(f.scheduledDate, now) &&
        f.trashedAt == null
      );
    case 'upcoming':
      return (
        active &&
        f.scheduledType === ScheduledType.DATE &&
        !isDateLte(f.scheduledDate, now) &&
        f.trashedAt == null
      );
    case 'anytime':
      return (
        f.bucket === TaskBucket.ANYTIME &&
        active &&
        f.scheduledType === ScheduledType.NONE &&
        f.trashedAt == null
      );
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
  if (params.projectId)
    filtered = filtered.filter((row) => row.fields.projectId === params.projectId);
  if (params.areaId) filtered = filtered.filter((row) => row.fields.areaId === params.areaId);
  if (params.tagId) {
    filtered = filtered.filter(
      (row) =>
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
      return (
        active &&
        f.scheduledType === ScheduledType.DATE &&
        isDateLte(f.scheduledDate, now) &&
        f.trashedAt == null
      );
    case 'upcoming':
      return (
        active &&
        f.scheduledType === ScheduledType.DATE &&
        !isDateLte(f.scheduledDate, now) &&
        f.trashedAt == null
      );
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
