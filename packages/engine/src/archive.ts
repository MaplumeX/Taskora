/**
 * 归档的 Logbook（local-first-v3 issue 08）：Local Replica 只保留最近一段
 * 时间的已了结任务，更早的留在 hub，Logbook 滚到底时按页从 hub 读取
 * （只读、不进副本）。
 *
 * 归档任务同时满足：
 * - 已了结（Completed / Cancelled）且了结时间早于截止时刻；
 * - 不在 Trash 里（清空 Trash 按副本里的行发 Delete Request）；
 * - 不属于进行中的项目（项目进度按项目下全部任务计数）。
 *
 * 规则只有这一份：hub 的 bootstrap 按它省略快照行，设备按它裁剪副本。
 * 被裁掉的行若在 hub 上被修改，会随变更日志回到副本（Engine 顺带补齐
 * 其 Subtask）。LWW 不受影响：裁剪只删除本地行，不产生字段写。
 */

import { ProjectStatus, SETTLED_TASK_STATUSES } from '@taskora/shared';

/** 副本保留已了结任务的缺省天数。 */
export const DEFAULT_ARCHIVE_AFTER_DAYS = 365;

/** 归档截止时刻（ISO）：在它之前了结的任务可以归档。 */
export function archiveCutoff(nowMs: number, days: number): string {
  return new Date(nowMs - days * 24 * 3600 * 1000).toISOString();
}

export interface ArchiveTaskFields {
  status?: unknown;
  settledAt?: unknown;
  trashedAt?: unknown;
  projectId?: unknown;
}

/**
 * 任务是否归档。projectStatus：任务所属项目的状态（无项目时忽略）；
 * 项目不在副本里时传 undefined，按「进行中」保守处理。
 */
export function isArchivedTask(
  task: ArchiveTaskFields,
  projectStatus: string | null | undefined,
  cutoff: string,
): boolean {
  if (!SETTLED_TASK_STATUSES.includes(task.status as never)) return false;
  if (typeof task.settledAt !== 'string' || !(task.settledAt < cutoff)) return false;
  if (task.trashedAt != null) return false;
  if (task.projectId == null) return true;
  return projectStatus === ProjectStatus.COMPLETED;
}
