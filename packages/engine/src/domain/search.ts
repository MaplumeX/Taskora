/**
 * 任务搜索（Quick Find，`.scratch/quick-find`）：范围、命中、相关度与顺序。
 *
 * 设备（Engine 后端）与 hub（REST 服务）都以这里为准：各自可以先用存储
 * 查询粗筛（SQL where），但最终的命中与排序必须经过 planTaskSearch，
 * 粗筛只能比它宽。
 */

import { SETTLED_TASK_STATUSES, TaskStatus, type TaskSearchRank } from '@taskora/shared';

import { instantMs } from './calendar';
import { effectivePosition, type Positioned } from './order';

export interface SearchTaskFields extends Positioned {
  id: string;
  title: unknown;
  notes: unknown;
  status: unknown;
  trashedAt: unknown;
}

export interface SearchSubtaskFields {
  id: string;
  taskId: unknown;
  title: unknown;
  sortOrder?: unknown;
  createdAt?: unknown;
}

export interface TaskSearchOptions {
  /** 继续搜索：在未了结之外纳入已了结（Logbook）与 Trash 中的任务。 */
  extended?: boolean;
}

export interface PlannedSearchHit<T, S> {
  task: T;
  matchedSubtasks: S[];
  rank: TaskSearchRank;
}

/** 搜索词归一：去首尾空白、小写。空串表示不搜索。 */
export function searchNeedle(q: string | null | undefined): string {
  return (q ?? '').trim().toLowerCase();
}

function lower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/** 默认：未了结且不在 Trash；extended：再加已了结与 Trash。 */
export function taskInSearchScope(task: SearchTaskFields, options?: TaskSearchOptions): boolean {
  if (task.trashedAt != null) return options?.extended === true;
  if (task.status === TaskStatus.ACTIVE) return true;
  return options?.extended === true && SETTLED_TASK_STATUSES.includes(task.status as TaskStatus);
}

/**
 * 相关度档位：标题前缀 > 标题包含 > 仅备注 / Subtask 命中；都不命中为 null。
 * needle 须已经过 searchNeedle。
 */
export function taskSearchRank(
  task: Pick<SearchTaskFields, 'title' | 'notes'>,
  hasSubtaskMatch: boolean,
  needle: string,
): TaskSearchRank | null {
  if (!needle) return null;
  const title = lower(task.title);
  if (title.startsWith(needle)) return 'titlePrefix';
  if (title.includes(needle)) return 'title';
  if (hasSubtaskMatch || lower(task.notes).includes(needle)) return 'other';
  return null;
}

const RANK_ORDER: Record<TaskSearchRank, number> = { titlePrefix: 0, title: 1, other: 2 };

/** 同档内：未了结 → 已了结 → Trash。 */
function scopeTier(task: SearchTaskFields): number {
  if (task.trashedAt != null) return 2;
  return task.status === TaskStatus.ACTIVE ? 0 : 1;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortSubtasks<S extends SearchSubtaskFields>(subtasks: S[]): S[] {
  return subtasks.sort(
    (a, b) =>
      (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) ||
      (instantMs(a.createdAt) ?? 0) - (instantMs(b.createdAt) ?? 0) ||
      compareStrings(a.id, b.id),
  );
}

/**
 * 搜索：范围过滤 → 标题 / 备注 / Subtask 标题命中 → 排序（档位 → 范围层级
 * → 有效 Position → id）。subtasks 可以比候选任务的子任务更宽，这里会按
 * taskId 与标题重新判定。Subtask 自身的状态不影响命中。
 */
export function planTaskSearch<T extends SearchTaskFields, S extends SearchSubtaskFields>(
  tasks: readonly T[],
  subtasks: readonly S[],
  q: string,
  options?: TaskSearchOptions,
): PlannedSearchHit<T, S>[] {
  const needle = searchNeedle(q);
  if (!needle) return [];

  const matchedByTask = new Map<string, S[]>();
  for (const subtask of subtasks) {
    if (typeof subtask.taskId !== 'string' || !lower(subtask.title).includes(needle)) continue;
    const list = matchedByTask.get(subtask.taskId);
    if (list) list.push(subtask);
    else matchedByTask.set(subtask.taskId, [subtask]);
  }

  const hits: Array<PlannedSearchHit<T, S> & { key: string }> = [];
  for (const task of tasks) {
    if (!taskInSearchScope(task, options)) continue;
    const matched = matchedByTask.get(task.id) ?? [];
    const rank = taskSearchRank(task, matched.length > 0, needle);
    if (rank === null) continue;
    hits.push({ task, matchedSubtasks: sortSubtasks(matched), rank, key: effectivePosition(task) });
  }

  hits.sort(
    (a, b) =>
      RANK_ORDER[a.rank] - RANK_ORDER[b.rank] ||
      scopeTier(a.task) - scopeTier(b.task) ||
      compareStrings(a.key, b.key) ||
      compareStrings(a.task.id, b.task.id),
  );
  return hits.map(({ task, matchedSubtasks, rank }) => ({ task, matchedSubtasks, rank }));
}
