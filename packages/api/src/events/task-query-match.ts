import { toDateKey, todayDateKey } from '@/utils/date';
import {
  hidesTasksInLaterProjects,
  ScheduledType,
  TaskBucket,
  TaskStatus,
  SETTLED_TASK_STATUSES,
} from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';
import { effectiveTaskTagIds, tagHit, type TagParents } from '@taskora/engine';

import type { TaskQuery } from '@/api/tasks.api';

/** 已了结（Settled）状态白名单：与后端共用 @taskora/shared 的单一来源（ADR 0006）。 */
const SETTLED_STATUSES = SETTLED_TASK_STATUSES;

const NO_TAG_PARENTS: TagParents = {
  project: () => undefined,
  area: () => undefined,
  subtreeOf: (tagId) => new Set([tagId]),
};

function isSettled(status: TaskStatus): boolean {
  return SETTLED_STATUSES.includes(status);
}

/**
 * Client-side port of the backend task list semantics (TasksService.findAll
 * + buildTaskViewWhere) so the event applier can decide which cached task
 * lists a Change Event payload belongs to.
 *
 * `params` comes from the query key (taskKeys.list(params)) and may carry
 * undefined values — those are treated as absent, mirroring axios params.
 *
 * tagId 按有效 Tag 判定（ADR 0015）：继承来源取自缓存里的 Project / Area，
 * 缓存里找不到的父级不贡献 Tag；命中该 Tag 的整棵子树（ADR-0016），Tag
 * 树取自缓存里的 Tag 列表。
 */
export function taskMatchesQuery(
  task: TaskResponseDto,
  params: unknown,
  now: Date = new Date(),
  isLaterProjectId: (projectId: string) => boolean = () => false,
  tagParents: TagParents = NO_TAG_PARENTS,
): boolean {
  const query = (params ?? {}) as TaskQuery;

  if (query.view) {
    // 稍后项目内的任务在 Anytime / Someday 中随父项目休眠（Later Project）。
    if (hidesTasksInLaterProjects(query.view) && task.projectId && isLaterProjectId(task.projectId)) {
      return false;
    }
    return taskMatchesView(task, query.view, now);
  }

  if (query.projectId !== undefined && task.projectId !== query.projectId) return false;
  if (query.areaId !== undefined && task.areaId !== query.areaId) return false;
  if (query.tagId !== undefined) {
    const own = (task.tags ?? []).map((t) => t.id);
    const effective = effectiveTaskTagIds({ ...task, tagIds: own }, tagParents);
    if (!tagHit(effective, query.tagId, tagParents)) return false;
  }
  if (query.hasScheduled === true && task.scheduledDate === null) return false;

  if (query.q) {
    const q = query.q.toLowerCase();
    const inTitle = task.title.toLowerCase().includes(q);
    const inNotes = task.notes?.toLowerCase().includes(q) ?? false;
    if (!inTitle && !inNotes) return false;
    // q mode: default ACTIVE; completed=true widens to all three statuses
    // （与后端 WITH_SETTLED_STATUSES 白名单逐一对齐）。
    if (!query.completed && task.status !== TaskStatus.ACTIVE) return false;
    return task.trashedAt === null;
  }

  if (!query.completed) {
    return task.status === TaskStatus.ACTIVE && task.trashedAt === null;
  }
  return task.trashedAt === null;
}

function taskMatchesView(
  task: TaskResponseDto,
  view: NonNullable<TaskQuery['view']>,
  now: Date,
): boolean {
  switch (view) {
    case 'inbox':
      return (
        task.bucket === TaskBucket.INBOX &&
        task.status === TaskStatus.ACTIVE &&
        task.scheduledType === ScheduledType.NONE &&
        task.trashedAt === null
      );
    case 'today': {
      // 计划日期或截止日期 ≤ 今天（截止日期到了也进 Today）。
      const today = todayDateKey(now);
      const scheduledReached =
        task.scheduledType === ScheduledType.DATE &&
        task.scheduledDate !== null &&
        toDateKey(task.scheduledDate) <= today;
      const deadlineReached = task.dueDate !== null && toDateKey(task.dueDate) <= today;
      return (
        task.status === TaskStatus.ACTIVE &&
        (scheduledReached || deadlineReached) &&
        task.trashedAt === null
      );
    }
    case 'upcoming':
      return (
        task.status === TaskStatus.ACTIVE &&
        task.scheduledType === ScheduledType.DATE &&
        task.scheduledDate !== null &&
        toDateKey(task.scheduledDate) > todayDateKey(now) &&
        task.trashedAt === null
      );
    case 'anytime':
      return (
        task.bucket === TaskBucket.ANYTIME &&
        task.status === TaskStatus.ACTIVE &&
        task.scheduledType === ScheduledType.NONE &&
        task.trashedAt === null
      );
    case 'someday':
      return (
        task.scheduledType === ScheduledType.SOMEDAY &&
        task.status === TaskStatus.ACTIVE &&
        task.trashedAt === null
      );
    case 'trash':
      return task.trashedAt !== null;
    case 'logbook':
      // Logbook = 已了结（完成 + 取消）任务的档案，与后端
      // buildTaskViewWhere 的 SETTLED_STATUSES 白名单一致。
      return isSettled(task.status) && task.trashedAt === null;
  }
}
