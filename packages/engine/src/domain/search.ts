/**
 * 任务搜索（Quick Find，`.scratch/quick-find`）：范围、命中、相关度与顺序。
 *
 * 设备（Engine 后端）与 hub（REST 服务）都以这里为准：各自可以先用存储
 * 查询粗筛（SQL where），但最终的命中与排序必须经过 planTaskSearch，
 * 粗筛只能比它宽。
 */

import { SETTLED_TASK_STATUSES, TaskStatus, type TaskSearchRank } from '@taskora/shared';

import { settledIsLogged, type ViewContext } from './logging';
import { effectivePosition, sortByEffectivePosition, type Positioned } from './order';
import { effectiveTaskTagIds, tagHit, type TagParents } from './tags';

export interface SearchTaskFields extends Positioned {
  id: string;
  title: unknown;
  notes: unknown;
  status: unknown;
  trashedAt: unknown;
  /** 了结时间：判定已了结的任务是否还是 Unlogged Item（Logging Mode）。 */
  settledAt?: unknown;
  /** 自身 Tag 与归属：只在带 Tag 条件时用于算有效 Tag。 */
  tagIds?: readonly string[];
  projectId?: unknown;
  areaId?: unknown;
}

export interface SearchSubtaskFields extends Positioned {
  id: string;
  taskId: unknown;
  title: unknown;
}

export interface TaskSearchOptions {
  /** 继续搜索：在未了结之外纳入已了结（Logbook）与 Trash 中的任务。 */
  extended?: boolean;
  /**
   * Tag 条件（Quick Find 的 `#tag`）：各个 Tag 之间是 AND，每个按有效 Tag
   * 的子树命中（ADR 0015 / 0016）。有 Tag 条件时搜索词可以为空。
   */
  tagIds?: readonly string[];
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

/** 是否有可搜的条件：搜索词或 Tag 条件，都没有时不搜索。 */
export function hasSearchCriteria(
  q: string | null | undefined,
  options?: TaskSearchOptions,
): boolean {
  return searchNeedle(q) !== '' || (options?.tagIds?.length ?? 0) > 0;
}

/**
 * 还留在原视图里的任务（未了结，或尚未移入 Logbook 的已了结任务）按未了结
 * 对待：在默认范围里，与未了结任务同档。未给出 context 时按立即模式。
 */
function listedInViews(task: SearchTaskFields, context?: ViewContext): boolean {
  if (task.status === TaskStatus.ACTIVE) return true;
  return (
    context !== undefined &&
    SETTLED_TASK_STATUSES.includes(task.status as TaskStatus) &&
    !settledIsLogged(task.settledAt, context)
  );
}

/** 默认：未了结（含 Unlogged Item）且不在 Trash；extended：再加已了结与 Trash。 */
export function taskInSearchScope(
  task: SearchTaskFields,
  options?: TaskSearchOptions,
  context?: ViewContext,
): boolean {
  if (task.trashedAt != null) return options?.extended === true;
  if (listedInViews(task, context)) return true;
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

/** 同档内：未了结（含 Unlogged Item）→ 已了结 → Trash。 */
function scopeTier(task: SearchTaskFields, context?: ViewContext): number {
  if (task.trashedAt != null) return 2;
  return listedInViews(task, context) ? 0 : 1;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortSubtasks<S extends SearchSubtaskFields>(subtasks: S[]): S[] {
  return sortByEffectivePosition(subtasks);
}

/**
 * 搜索：范围过滤 → Tag 条件 → 标题 / 备注 / Subtask 标题命中 → 排序（档位
 * → 范围层级 → 有效 Position → id）。subtasks 可以比候选任务的子任务更宽，
 * 这里会按 taskId 与标题重新判定。Subtask 自身的状态不影响命中。
 *
 * 带 Tag 条件时必须传入 parents（有效 Tag 的继承来源与 Tag 树）。只有 Tag
 * 条件、没有搜索词时，范围内命中全部 Tag 的任务都算命中，档位记为 other，
 * 顺序退化为范围层级 → 有效 Position。context 给出移入时机（Logging Mode）。
 */
export function planTaskSearch<T extends SearchTaskFields, S extends SearchSubtaskFields>(
  tasks: readonly T[],
  subtasks: readonly S[],
  q: string,
  options?: TaskSearchOptions,
  parents?: TagParents,
  context?: ViewContext,
): PlannedSearchHit<T, S>[] {
  const needle = searchNeedle(q);
  const tagIds = options?.tagIds ?? [];
  if (!needle && tagIds.length === 0) return [];
  if (tagIds.length > 0 && !parents) {
    throw new Error('planTaskSearch: Tag 条件需要 TagParents');
  }
  const inTags = (task: T): boolean => {
    if (tagIds.length === 0 || !parents) return true;
    const effective = effectiveTaskTagIds(
      { tagIds: task.tagIds ?? [], projectId: task.projectId, areaId: task.areaId },
      parents,
    );
    return tagIds.every((tagId) => tagHit(effective, tagId, parents));
  };

  const matchedByTask = new Map<string, S[]>();
  for (const subtask of subtasks) {
    if (!needle) break;
    if (typeof subtask.taskId !== 'string' || !lower(subtask.title).includes(needle)) continue;
    const list = matchedByTask.get(subtask.taskId);
    if (list) list.push(subtask);
    else matchedByTask.set(subtask.taskId, [subtask]);
  }

  const hits: Array<PlannedSearchHit<T, S> & { key: string }> = [];
  for (const task of tasks) {
    if (!taskInSearchScope(task, options, context) || !inTags(task)) continue;
    const matched = matchedByTask.get(task.id) ?? [];
    const rank = needle ? taskSearchRank(task, matched.length > 0, needle) : 'other';
    if (rank === null) continue;
    hits.push({ task, matchedSubtasks: sortSubtasks(matched), rank, key: effectivePosition(task) });
  }

  hits.sort(
    (a, b) =>
      RANK_ORDER[a.rank] - RANK_ORDER[b.rank] ||
      scopeTier(a.task, context) - scopeTier(b.task, context) ||
      compareStrings(a.key, b.key) ||
      compareStrings(a.task.id, b.task.id),
  );
  return hits.map(({ task, matchedSubtasks, rank }) => ({ task, matchedSubtasks, rank }));
}
