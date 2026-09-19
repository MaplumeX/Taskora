import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';

import type { TaskQuery } from '@/api/tasks.api';

/** 已了结（Settled）状态白名单：Logbook Entry 口径（ADR 0006）。 */
const SETTLED_STATUSES = [TaskStatus.COMPLETED, TaskStatus.CANCELLED] as const;

function isSettled(status: TaskStatus): boolean {
  return (SETTLED_STATUSES as readonly TaskStatus[]).includes(status);
}

/**
 * Client-side port of the backend task list semantics (TasksService.findAll
 * + buildTaskViewWhere) so the event applier can decide which cached task
 * lists a Change Event payload belongs to.
 *
 * `params` comes from the query key (taskKeys.list(params)) and may carry
 * undefined values — those are treated as absent, mirroring axios params.
 */
export function taskMatchesQuery(
  task: TaskResponseDto,
  params: unknown,
  now: Date = new Date(),
): boolean {
  const query = (params ?? {}) as TaskQuery;

  if (query.view) {
    return taskMatchesView(task, query.view, now);
  }

  if (query.projectId !== undefined && task.projectId !== query.projectId) return false;
  if (query.areaId !== undefined && task.areaId !== query.areaId) return false;
  if (query.tagId !== undefined && !(task.tags ?? []).some((t) => t.id === query.tagId)) {
    return false;
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
    case 'today':
      return (
        task.status === TaskStatus.ACTIVE &&
        task.scheduledType === ScheduledType.DATE &&
        task.scheduledDate !== null &&
        new Date(task.scheduledDate) <= now &&
        task.trashedAt === null
      );
    case 'upcoming':
      return (
        task.status === TaskStatus.ACTIVE &&
        task.scheduledType === ScheduledType.DATE &&
        task.scheduledDate !== null &&
        new Date(task.scheduledDate) > now &&
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
