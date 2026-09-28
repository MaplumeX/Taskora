/**
 * Reveal Task 的目标路由（reminder-actions spec）：给定任务，选出最能
 * 容纳它的视图。顺序：Today 可见 → 所属 Project → 所属 Area → 按
 * Bucket 落到 Upcoming / Someday / Anytime / Inbox；已了结落 Logbook。
 * 已进 Trash 返回 null（只打开 App，不导航）。
 */

import { ScheduledType, TaskBucket, TaskStatus, type TaskResponseDto } from '@taskora/shared';

import { toDateKey, todayDateKey } from './date';

export type RevealTarget = Pick<
  TaskResponseDto,
  'status' | 'trashedAt' | 'scheduledType' | 'scheduledDate' | 'projectId' | 'areaId' | 'bucket'
>;

export function revealRouteFor(task: RevealTarget, now = new Date()): string | null {
  if (task.trashedAt != null) return null;
  if (task.status !== TaskStatus.ACTIVE) return '/logbook';
  const dated = task.scheduledType === ScheduledType.DATE && task.scheduledDate != null;
  if (dated && toDateKey(task.scheduledDate!) <= todayDateKey(now)) return '/today';
  if (task.projectId) return `/projects/${task.projectId}`;
  if (task.areaId) return `/areas/${task.areaId}`;
  if (dated) return '/upcoming';
  if (task.scheduledType === ScheduledType.SOMEDAY) return '/someday';
  if (task.bucket === TaskBucket.ANYTIME) return '/anytime';
  return '/inbox';
}
