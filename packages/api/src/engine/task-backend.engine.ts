/**
 * Engine 实现的 Task 传输层 — 桌面端完全体（ADR-0007 / ADR-0008）。
 *
 * Task/Feed/Subtask 的全部读写直接作用于 Local Replica：零网络往返、
 * 断网全功能可用；写操作进 Outbox，由调用方（desktop boot）调度
 * flush/pull 收敛。领域规则（bucket 推导、视图过滤、生命周期、重复
 * 派生、转项目、清空 Trash）来自 @taskora/engine 的 domain 纯函数，与
 * hub 的 REST 服务共用（local-first-v3 issue 04）；这里只负责读副本、
 * 调规则、写副本，以及位次分配。
 */

import { currentLegacyDateTimeZone, currentTimeZone, projectLaterKind } from '@/utils/date';
import type {
  CalendarContext,
  CalendarZones,
  Engine,
  ListWhere,
  ReplicaRow,
} from '@taskora/engine';
import {
  countProjectTasks,
  feedIncludesProjects,
  normalizeRepeatRule,
  planConvertTaskToProject,
  planEmptyTrash,
  planRepeatInstance,
  planRepeatSkip,
  planTaskComplete,
  planTaskCreate,
  planTaskSearch,
  planTaskUpdate,
  positionAfter,
  projectMatchesView,
  repeatDerivationTarget,
  RepeatSkipBlockedError,
  feedSortKey,
  repositionFeed,
  repositionMinimal,
  searchNeedle,
  sortFeedItems,
  sortForView,
  subtaskStatusPatch,
  taskCancelPatch,
  taskMatchesQuery,
  taskMatchesView,
  taskReopenPatch,
  taskRestorePatch,
  taskTrashPatch,
} from '@taskora/engine';
import {
  hidesTasksInLaterProjects,
  ProjectStatus,
  ScheduledType,
  TaskStatus,
  ProjectBucket,
} from '@taskora/shared';
import type {
  CreateSubtaskDto,
  CreateTaskDto,
  FeedItem,
  FeedOrderItem,
  FeedView,
  ProjectResponseDto,
  SubtaskResponseDto,
  TagResponseDto,
  TaskFeedItem,
  TaskResponseDto,
  TaskSearchHit,
  UpdateSubtaskDto,
  UpdateTaskDto,
} from '@taskora/shared';

import type { TaskBackend, TaskQuery, TaskSearchOptions } from '../api/task-backend';
import {
  SETTLED_TASK_STATUSES as SETTLED_STATUSES,
  projectRowToDto,
  subtaskRowToDto,
  tagIndexFor,
  taskRowToDto,
} from './mappers';

/** 账户时区（用户偏好）：日历日期的解读与「今天」。 */
function zones(): CalendarZones {
  return { timeZone: currentTimeZone(), legacyDateTimeZone: currentLegacyDateTimeZone() };
}

function calendar(): CalendarContext {
  return { ...zones(), now: new Date() };
}

function tagIdsOf(row: ReplicaRow): string[] {
  return Array.isArray(row.fields.tagIds) ? (row.fields.tagIds as string[]) : [];
}

/** 副本行 → 视图 / 查询判定的字段。 */
function queryFieldsOf(row: ReplicaRow) {
  const f = row.fields;
  return {
    status: f.status,
    scheduledType: f.scheduledType,
    scheduledDate: f.scheduledDate,
    trashedAt: f.trashedAt,
    bucket: f.bucket,
    title: f.title,
    notes: f.notes,
    projectId: f.projectId,
    areaId: f.areaId,
    tagIds: tagIdsOf(row),
  };
}

/** 副本行 → 搜索判定与排序的字段。 */
function searchFieldsOf(row: ReplicaRow) {
  const f = row.fields;
  return {
    id: row.id,
    title: f.title,
    notes: f.notes,
    status: f.status,
    trashedAt: f.trashedAt,
    position: typeof f.position === 'string' ? f.position : null,
    sortOrder: typeof f.sortOrder === 'number' ? f.sortOrder : null,
    createdAt: typeof f.createdAt === 'string' ? f.createdAt : null,
  };
}

export interface EngineTaskBackendOptions {
  engine: Engine;
}

export function createEngineTaskBackend(options: EngineTaskBackendOptions): TaskBackend {
  const { engine } = options;

  // ---------- 读 ----------

  const tagIndex = (): Promise<Map<string, TagResponseDto>> => tagIndexFor(engine);

  async function subtasksOf(taskId: string): Promise<SubtaskResponseDto[]> {
    const rows = await engine.list('subtask', { where: { taskId } });
    return rows.map((row) => subtaskRowToDto(row));
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
  async function setSubtaskStatus(id: string, status: TaskStatus): Promise<SubtaskResponseDto> {
    await engine.update('subtask', id, subtaskStatusPatch(status, new Date().toISOString()));
    return subtaskDto(id);
  }

  /**
   * Repeat Instance 派生（recurring-tasks spec / ADR-0012）：完成的设备
   * 在本地立刻派生下一个实例（规则见 domain planRepeatInstance），写入
   * Local Replica、走 Outbox，断网全功能。parent 为结算前的任务行。
   */
  async function deriveRepeatInstance(
    parentId: string,
    parent: ReplicaRow,
    settledAt: string,
  ): Promise<string | null> {
    const f = parent.fields;
    const subtasks = await engine.list('subtask', { where: { taskId: parentId } });
    const plan = planRepeatInstance(
      {
        id: parentId,
        title: (f.title as string) ?? '',
        notes: (f.notes as string | null) ?? null,
        scheduledDate: f.scheduledDate,
        repeatRule: normalizeRepeatRule(f.repeatRule),
        reminderTime: (f.reminderTime as string | null) ?? null,
        projectId: (f.projectId as string | null) ?? null,
        headingId: (f.headingId as string | null) ?? null,
        areaId: (f.areaId as string | null) ?? null,
        tagIds: tagIdsOf(parent),
      },
      subtasks.map((row) => ({
        title: (row.fields.title as string) ?? '',
        sortOrder: row.fields.sortOrder,
        createdAt: row.fields.createdAt,
      })),
      settledAt,
      zones(),
    );
    if (!plan) return null;
    const linked = await engine.list('task', {
      where: { repeatSourceId: parentId, trashedAt: null },
      limit: 1,
    });
    const plannedRow = await engine.get('task', plan.id);
    const target = repeatDerivationTarget({
      hasLinkedInstance: linked.length > 0,
      plannedId: plannedRow
        ? plannedRow.fields.trashedAt
          ? 'trashed'
          : 'live'
        : (await engine.isCompacted('task', plan.id))
          ? 'compacted'
          : 'absent',
    });
    if (target === 'skip') return null;

    // 派生实例进入目标列表末尾（新位次，不继承父任务位次）
    const allTasks = await engine.list('task');
    const position = positionAfter(
      allTasks,
      allTasks.length > 0 ? allTasks[allTasks.length - 1].id : null,
    );
    const sortOrder =
      allTasks.reduce((max, row) => Math.max(max, (row.fields.sortOrder as number) ?? 0), -1) + 1;
    const instanceId = await engine.create('task', {
      ...(target === 'planned' ? { id: plan.id } : {}),
      ...plan.task,
      position,
      sortOrder,
    });
    for (const subtask of plan.subtasksFor(instanceId)) {
      await engine.create('subtask', { ...subtask });
    }
    return instanceId;
  }

  /** 需要隐藏其内任务的稍后项目 id（仅 Anytime / Someday，语义对齐 backend views.ts）。 */
  async function laterProjectIdsFor(view: string | undefined): Promise<ReadonlySet<string>> {
    if (!hidesTasksInLaterProjects(view)) return NO_PROJECT_IDS;
    const rows = await engine.list('project');
    return new Set(rows.filter((row) => isLaterProjectRow(row)).map((row) => row.id));
  }

  return {
    async getTasks(params?: TaskQuery): Promise<TaskResponseDto[]> {
      const rows = await engine.list('task', { where: tasksPrefilter(params) });
      const index = await tagIndex();
      const context = calendar();
      const inActiveProject = notInLaterProject(await laterProjectIdsFor(params?.view));
      const visible = rows.filter(
        (row) =>
          inActiveProject(row) && taskMatchesQuery(queryFieldsOf(row), params ?? {}, context),
      );
      return sortForView(
        visible.map((row) => taskRowToDto(row, index)),
        params?.view,
        (task) => task.completedAt,
      );
    },

    async searchTasks(q: string, options?: TaskSearchOptions): Promise<TaskSearchHit[]> {
      if (!searchNeedle(q)) return [];
      // 副本在本机，全量读出后由 domain 判定命中；默认范围先用 SQL 粗筛
      const taskRows = await engine.list(
        'task',
        options?.extended ? undefined : { where: { status: TaskStatus.ACTIVE, trashedAt: null } },
      );
      const subtaskRows = await engine.list('subtask');
      const hits = planTaskSearch(
        taskRows.map((row) => ({ ...searchFieldsOf(row), row })),
        subtaskRows.map((row) => ({
          id: row.id,
          taskId: row.fields.taskId,
          title: row.fields.title,
          sortOrder: row.fields.sortOrder,
          createdAt: row.fields.createdAt,
        })),
        q,
        options,
      );
      const index = await tagIndex();
      return hits.map(({ task, matchedSubtasks, rank }) => ({
        task: taskRowToDto(task.row, index),
        matchedSubtasks: matchedSubtasks.map((subtask) => ({
          id: subtask.id,
          title: typeof subtask.title === 'string' ? subtask.title : '',
        })),
        rank,
      }));
    },

    async getTask(id: string): Promise<TaskResponseDto> {
      const dto = await taskDto(id);
      dto.subtasks = await subtasksOf(id);
      return dto;
    },

    async getFeed(view: FeedView): Promise<FeedItem[]> {
      const index = await tagIndex();
      const context = calendar();
      const viewTasks = await engine.list('task', { where: viewPrefilter(view) });
      const inActiveProject = notInLaterProject(await laterProjectIdsFor(view));
      const taskItems: TaskFeedItem[] = viewTasks
        .filter((row) => inActiveProject(row) && taskMatchesView(queryFieldsOf(row), view, context))
        .map((row) => {
          const dto = taskRowToDto(row, index);
          return { ...dto, type: 'task' as const, tags: dto.tags ?? [] };
        });

      let projectItems: FeedItem[] = [];
      if (feedIncludesProjects(view)) {
        const projectRows = (await engine.list('project')).filter((row) =>
          projectMatchesView(queryFieldsOf(row), view, context),
        );
        const projectIds = projectRows.map((row) => row.id);
        const counts = countProjectTasks(
          projectIds,
          (
            await engine.list('task', { where: { projectId: { in: projectIds }, trashedAt: null } })
          ).map(queryFieldsOf),
        );
        projectItems = projectRows.map((row) => {
          const { total, completed } = counts.get(row.id)!;
          return projectRowToFeedItem(row, index, total, completed);
        });
      }
      return sortFeedItems([...taskItems, ...projectItems], view);
    },

    // ---------- 写（全部本地，进 Outbox） ----------

    async createTask(data: CreateTaskDto): Promise<TaskResponseDto> {
      // 新任务插在最前（newest-first）：只需要当前首行的位次
      const existing = await engine.list('task', { limit: 1 });
      const id = await engine.create('task', {
        ...planTaskCreate(data, zones()),
        position: positionAfter(existing, null),
      });
      return taskDto(id);
    },

    async updateTask(id: string, data: UpdateTaskDto): Promise<TaskResponseDto> {
      const existing = await engine.get('task', id);
      if (!existing) throw new Error(`Task not found: ${id}`);
      const f = existing.fields;
      const patch = planTaskUpdate(
        {
          scheduledType: f.scheduledType,
          scheduledDate: f.scheduledDate,
          bucket: f.bucket,
          projectId: (f.projectId as string | null) ?? null,
          areaId: (f.areaId as string | null) ?? null,
          headingId: (f.headingId as string | null) ?? null,
        },
        data,
        zones(),
      );
      await engine.update('task', id, { ...patch });
      return taskDto(id);
    },

    async deleteTask(id: string): Promise<void> {
      await engine.update('task', id, { ...taskTrashPatch(new Date().toISOString()) });
    },

    async restoreTask(id: string): Promise<TaskResponseDto> {
      await engine.update('task', id, { ...taskRestorePatch() });
      return taskDto(id);
    },

    async completeTask(id: string, options?: { settledAt?: string }): Promise<TaskResponseDto> {
      const existing = await engine.get('task', id);
      if (!existing) throw new Error(`Task not found: ${id}`);
      const settledAt = options?.settledAt ?? new Date().toISOString();
      const plan = planTaskComplete(existing.fields.status, settledAt);
      if (!plan) return taskDto(id);
      await engine.update('task', id, { ...plan.patch });
      if (plan.deriveRepeat) await deriveRepeatInstance(id, existing, settledAt);
      return taskDto(id);
    },

    async uncompleteTask(id: string): Promise<TaskResponseDto> {
      // 已派生的实例独立存活，不随重开删除（recurring-tasks-v2）
      await engine.update('task', id, { ...taskReopenPatch() });
      return taskDto(id);
    },

    async cancelTask(id: string): Promise<TaskResponseDto> {
      await engine.update('task', id, { ...taskCancelPatch(new Date().toISOString()) });
      return taskDto(id);
    },

    async uncancelTask(id: string): Promise<TaskResponseDto> {
      await engine.update('task', id, { ...taskReopenPatch() });
      return taskDto(id);
    },

    async skipTask(id: string): Promise<TaskResponseDto> {
      const existing = await engine.get('task', id);
      if (!existing) throw new Error(`Task not found: ${id}`);
      const f = existing.fields;
      const linked = await engine.list('task', {
        where: { repeatSourceId: id, trashedAt: null },
        limit: 1,
      });
      const now = new Date().toISOString();
      const plan = planRepeatSkip(
        {
          status: f.status,
          trashedAt: f.trashedAt,
          scheduledType: f.scheduledType,
          scheduledDate: f.scheduledDate,
          dueDate: f.dueDate,
          repeatRule: normalizeRepeatRule(f.repeatRule),
        },
        linked.length > 0,
        now,
        zones(),
      );
      if ('blocked' in plan) throw new RepeatSkipBlockedError(plan.blocked);
      await engine.update('task', id, { ...plan.patch });
      // 新的一轮：Subtask 全部置回未完成
      const settledSubtasks = (await engine.list('subtask', { where: { taskId: id } })).filter(
        (row) => row.fields.status !== TaskStatus.ACTIVE,
      );
      if (settledSubtasks.length > 0) {
        await engine.updateMany(
          'subtask',
          settledSubtasks.map((row) => ({
            id: row.id,
            patch: subtaskStatusPatch(TaskStatus.ACTIVE, now),
          })),
        );
      }
      return taskDto(id);
    },

    async reorderTasks(orderedIds: string[]): Promise<void> {
      const rows = await engine.list('task', { where: { id: { in: orderedIds } } });
      const byId = new Map(rows.map((row) => [row.id, row]));
      // 只给必须移动的行分配新 Position（单次拖动 = 一条写），一个事务
      // 一次通知。列表读序只看有效 Position（domain sortByEffectivePosition），
      // 不再需要稠密 sortOrder。
      const changes = repositionMinimal(
        orderedIds.flatMap((id) => {
          const row = byId.get(id);
          if (!row) return [];
          const position = row.fields.position;
          return [{ id, position: typeof position === 'string' ? position : null }];
        }),
      );
      await engine.updateMany(
        'task',
        changes.map(({ id, position }) => ({ id, patch: { position } })),
      );
    },

    async reorderFeed(items: FeedOrderItem[]): Promise<void> {
      // feed 混排（feed-project-ordering spec）：任务写 position，项目写
      // feedPosition（侧边栏 position 不动）；同 reorderTasks 只动必须移动的行。
      const ids = (type: FeedOrderItem['type']) =>
        items.filter((item) => item.type === type).map((item) => item.id);
      const [tasks, projects] = await Promise.all([
        engine.list('task', { where: { id: { in: ids('task') } } }),
        engine.list('project', { where: { id: { in: ids('project') } } }),
      ]);
      const taskKey = new Map(
        tasks.map((row) => [
          row.id,
          typeof row.fields.position === 'string' ? row.fields.position : null,
        ]),
      );
      const projectKey = new Map(
        projects.map((row) => [
          row.id,
          feedSortKey({
            id: row.id,
            position: typeof row.fields.position === 'string' ? row.fields.position : null,
            feedPosition:
              typeof row.fields.feedPosition === 'string' ? row.fields.feedPosition : null,
            sortOrder: typeof row.fields.sortOrder === 'number' ? row.fields.sortOrder : null,
            createdAt: (row.fields.createdAt as string | null) ?? null,
          }),
        ]),
      );
      const changes = repositionFeed(
        items.flatMap((item) => {
          const keys = item.type === 'task' ? taskKey : projectKey;
          if (!keys.has(item.id)) return [];
          return [{ ...item, key: keys.get(item.id) ?? null }];
        }),
      );
      await engine.updateMany(
        'task',
        changes
          .filter((change) => change.type === 'task')
          .map(({ id, position }) => ({ id, patch: { position } })),
      );
      await engine.updateMany(
        'project',
        changes
          .filter((change) => change.type === 'project')
          .map(({ id, position }) => ({ id, patch: { feedPosition: position } })),
      );
    },

    // ---------- Subtask CRUD（全部本地，进 Outbox） ----------

    async createSubtask(taskId: string, data: CreateSubtaskDto): Promise<SubtaskResponseDto> {
      const task = await engine.get('task', taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);
      if (data.id) {
        const existing = await engine.get('subtask', data.id);
        if (existing) return subtaskRowToDto(existing);
      }
      const existing = await subtasksOf(taskId);
      const afterIndex = data.afterId ? existing.findIndex((s) => s.id === data.afterId) : -1;
      let sortOrder: number;
      if (afterIndex < 0) {
        // sortOrder = max + 1（与 SubtasksService 一致：追加在末尾）
        sortOrder = existing.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1;
      } else {
        // 插入到 afterId 之后：整体重排为 0..n，插入点之后的各项顺延一位
        sortOrder = afterIndex + 1;
        await engine.updateMany(
          'subtask',
          existing.flatMap((s, index) => {
            const next = index < sortOrder ? index : index + 1;
            return s.sortOrder !== next ? [{ id: s.id, patch: { sortOrder: next } }] : [];
          }),
        );
      }
      const id = await engine.create('subtask', {
        ...(data.id ? { id: data.id } : {}),
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
        Object.assign(patch, subtaskStatusPatch(data.status, new Date().toISOString()));
      }
      await engine.update('subtask', id, patch);
      return subtaskDto(id);
    },

    async deleteSubtask(id: string): Promise<void> {
      await engine.delete('subtask', [id]);
    },

    async completeSubtask(id: string): Promise<SubtaskResponseDto> {
      return setSubtaskStatus(id, TaskStatus.COMPLETED);
    },

    async uncompleteSubtask(id: string): Promise<SubtaskResponseDto> {
      return setSubtaskStatus(id, TaskStatus.ACTIVE);
    },

    async cancelSubtask(id: string): Promise<SubtaskResponseDto> {
      return setSubtaskStatus(id, TaskStatus.CANCELLED);
    },

    async uncancelSubtask(id: string): Promise<SubtaskResponseDto> {
      return setSubtaskStatus(id, TaskStatus.ACTIVE);
    },

    async reorderSubtasks(taskId: string, orderedIds: string[]): Promise<void> {
      // 与 reorderTasks 同惯例：顺序未变的行不动，一个事务一次通知
      const rows = await engine.list('subtask', { where: { taskId } });
      const sortOrderOf = new Map(rows.map((row) => [row.id, row.fields.sortOrder]));
      await engine.updateMany(
        'subtask',
        orderedIds.flatMap((id, index) =>
          sortOrderOf.has(id) && sortOrderOf.get(id) !== index
            ? [{ id, patch: { sortOrder: index } }]
            : [],
        ),
      );
    },

    // ---------- hub 复合操作的 Engine 分解（ADR-0008） ----------

    /**
     * convert-to-project 全离线分解（规则见 domain planConvertTaskToProject）：
     * 新 Project 与提升出的 Task 是普通字段写（走 LWW）；原 Task 的消失
     * 是一个 Delete Request（级联其 Subtask）。
     */
    async convertTaskToProject(id: string): Promise<ProjectResponseDto> {
      const task = await engine.get('task', id);
      if (!task) throw new Error(`Task not found: ${id}`);
      const f = task.fields;
      const parent =
        typeof f.projectId === 'string' ? await engine.get('project', f.projectId) : null;
      const subtasks = await engine.list('subtask', { where: { taskId: id } });
      const plan = planConvertTaskToProject(
        {
          title: (f.title as string) ?? '',
          notes: (f.notes as string | null) ?? null,
          scheduledType: f.scheduledType,
          scheduledDate: f.scheduledDate,
          dueDate: f.dueDate,
          status: f.status,
          settledAt: (f.settledAt as string | null) ?? null,
          trashedAt: (f.trashedAt as string | null) ?? null,
          areaId: (f.areaId as string | null) ?? null,
          tagIds: tagIdsOf(task),
        },
        (parent?.fields.areaId as string | null) ?? null,
        subtasks.map((row) => ({
          title: (row.fields.title as string) ?? '',
          status: row.fields.status,
          settledAt: (row.fields.settledAt as string | null) ?? null,
        })),
        zones(),
      );

      // 新 Project 排在末尾（sortOrder = max + 1，Position 追加）
      const projects = await engine.list('project');
      const projectId = await engine.create('project', {
        ...plan.project,
        position: positionAfter(
          projects,
          projects.length > 0 ? projects[projects.length - 1].id : null,
        ),
        sortOrder:
          projects.reduce((max, p) => Math.max(max, (p.fields.sortOrder as number) ?? 0), -1) + 1,
      });

      // 提升出的 Task 逐条插到最前：每条都插在上一条之前
      let head = await engine.list('task', { limit: 1 });
      for (const promoted of plan.promotedTasks) {
        const position = positionAfter(head, null);
        const createdId = await engine.create('task', { ...promoted, projectId, position });
        head = [{ id: createdId, fields: { position } }];
      }

      // 原 Task 的消失：Delete Request（级联其 Subtask；不在 Trash 留尸体）
      await engine.delete('task', [id]);

      const index = await tagIndex();
      const project = await engine.get('project', projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      return projectRowToDto(project, index, 0, 0);
    },

    /** emptyTrash 复用 Delete Request（ADR-0008），删除集见 domain planEmptyTrash。 */
    async emptyTrash(): Promise<{ deletedTasks: number; deletedProjects: number }> {
      const trashedProjects = await engine.list('project', {
        where: { trashedAt: { notNull: true } },
      });
      const [trashedTasks, tasksOfTrashedProjects] = await Promise.all([
        engine.list('task', { where: { trashedAt: { notNull: true } } }),
        engine.list('task', { where: { projectId: { in: trashedProjects.map((row) => row.id) } } }),
      ]);
      const candidates = new Map(
        [...trashedTasks, ...tasksOfTrashedProjects].map((row) => [row.id, row]),
      );
      const plan = planEmptyTrash(
        trashedProjects.map((row) => ({ id: row.id, trashedAt: row.fields.trashedAt })),
        [...candidates.values()].map((row) => ({
          id: row.id,
          projectId: row.fields.projectId,
          trashedAt: row.fields.trashedAt,
        })),
      );
      await engine.delete('task', plan.taskIds);
      await engine.delete('project', plan.projectIds);
      return { deletedTasks: plan.taskIds.length, deletedProjects: plan.projectIds.length };
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
    repeatRule: null, // Project 不设 Repeat Rule（CONTEXT.md）
    repeatSourceId: null,
    dueDate: (f.dueDate as string | null) ?? null,
    status: (f.status as ProjectStatus) ?? ProjectStatus.ACTIVE,
    bucket: (f.bucket as ProjectBucket) ?? ProjectBucket.ANYTIME,
    completedAt: (f.completedAt as string | null) ?? null,
    trashedAt: (f.trashedAt as string | null) ?? null,
    sortOrder: (f.sortOrder as number) ?? 0,
    position: typeof f.position === 'string' ? f.position : null,
    feedPosition: typeof f.feedPosition === 'string' ? f.feedPosition : null,
    areaId: (f.areaId as string | null) ?? null,
    createdAt: (f.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
    tags: tagIds.map((id) => tags.get(id)).filter((t): t is TagResponseDto => t !== undefined),
    taskTotalCount,
    taskCompletedCount,
  };
}

/**
 * 视图的 SQL 预过滤：只做粗筛（精确语义由 domain taskMatchesView 判定，
 * 粗筛只能比它宽），让活跃视图不再把只增不减的 Logbook 整表读出来。
 */
function viewPrefilter(view: string | undefined): ListWhere | undefined {
  switch (view) {
    case 'inbox':
    case 'today':
    case 'upcoming':
    case 'anytime':
    case 'someday':
      return { status: TaskStatus.ACTIVE, trashedAt: null };
    case 'trash':
      return { trashedAt: { notNull: true } };
    case 'logbook':
      return { status: { in: [...SETTLED_STATUSES] }, trashedAt: null };
    default:
      return undefined;
  }
}

/** getTasks 的 SQL 预过滤（domain taskMatchesQuery 各分支的必要条件）。 */
function tasksPrefilter(params?: TaskQuery): ListWhere | undefined {
  if (params?.view) return viewPrefilter(params.view);
  const where: ListWhere = { trashedAt: null };
  if (params?.projectId) where.projectId = params.projectId;
  if (params?.areaId) where.areaId = params.areaId;
  if (!params?.completed) where.status = TaskStatus.ACTIVE;
  return where;
}

const NO_PROJECT_IDS: ReadonlySet<string> = new Set();

function isLaterProjectRow(row: ReplicaRow): boolean {
  const f = row.fields;
  return (
    projectLaterKind({
      status: f.status as string,
      trashedAt: (f.trashedAt as string | null) ?? null,
      scheduledType: f.scheduledType as string,
      scheduledDate: (f.scheduledDate as string | null) ?? null,
    }) !== null
  );
}

function notInLaterProject(laterIds: ReadonlySet<string>): (row: ReplicaRow) => boolean {
  return (row) => {
    const projectId = row.fields.projectId;
    return typeof projectId !== 'string' || !laterIds.has(projectId);
  };
}
