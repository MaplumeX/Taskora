/**
 * 视图规则（CONTEXT：Inbox / Today / Upcoming / Anytime / Someday /
 * Logbook / Trash）：一个任务或项目是否出现在某个视图里、feed 怎么排。
 *
 * 设备（Engine 后端）与 hub（REST 服务）都以这里的判定为准：各自可以
 * 先用存储查询粗筛（SQL where），但最终过滤必须经过这些函数，粗筛只能
 * 比它宽。
 */

import {
  ProjectStatus,
  ScheduledType,
  SETTLED_TASK_STATUSES,
  TaskBucket,
  TaskStatus,
  WITH_SETTLED_TASK_STATUSES,
} from '@taskora/shared';

import { dateKeyOf, instantMs, todayKey, type CalendarContext } from './calendar';
import { feedSortKey, sortByEffectivePosition, type FeedPositioned, type Positioned } from './order';
import { effectiveTaskTagIds, type TagParents } from './tags';

export type ListView = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'trash' | 'logbook';

/** 视图判定用到的字段（两端存储形态：日期可为 Date 或字符串）。 */
export interface ViewFields {
  status: unknown;
  scheduledType: unknown;
  scheduledDate: unknown;
  trashedAt: unknown;
}

export interface TaskViewFields extends ViewFields {
  bucket: unknown;
}

/** 只有 Today / Upcoming 依赖「今天」：其余视图不必查账户时区。 */
export function viewNeedsCalendar(view: string | undefined): boolean {
  return view === 'today' || view === 'upcoming';
}

function isSettledTask(status: unknown): boolean {
  return SETTLED_TASK_STATUSES.includes(status as TaskStatus);
}

/** DATE 计划相对「今天」的位置：today（今天及以前）/ upcoming / null（不适用）。 */
function datePlacement(fields: ViewFields, context: CalendarContext): 'today' | 'upcoming' | null {
  if (fields.scheduledType !== ScheduledType.DATE) return null;
  const day = dateKeyOf(fields.scheduledDate, context);
  if (day === null) return null;
  return day <= todayKey(context) ? 'today' : 'upcoming';
}

export function taskMatchesView(
  task: TaskViewFields,
  view: ListView,
  context: CalendarContext,
): boolean {
  const open = task.status === TaskStatus.ACTIVE && task.trashedAt == null;
  switch (view) {
    case 'inbox':
      return open && task.bucket === TaskBucket.INBOX && task.scheduledType === ScheduledType.NONE;
    case 'anytime':
      return (
        open && task.bucket === TaskBucket.ANYTIME && task.scheduledType === ScheduledType.NONE
      );
    case 'today':
    case 'upcoming':
      return open && datePlacement(task, context) === view;
    case 'someday':
      return open && task.scheduledType === ScheduledType.SOMEDAY;
    case 'trash':
      return task.trashedAt != null;
    case 'logbook':
      return isSettledTask(task.status) && task.trashedAt == null;
    default:
      return false;
  }
}

/** Project 只出现在排期与终态视图（Inbox / Anytime 不含项目）。 */
export function projectMatchesView(
  project: ViewFields,
  view: ListView,
  context: CalendarContext,
): boolean {
  const open = project.status === ProjectStatus.ACTIVE && project.trashedAt == null;
  switch (view) {
    case 'today':
    case 'upcoming':
      return open && datePlacement(project, context) === view;
    case 'someday':
      return open && project.scheduledType === ScheduledType.SOMEDAY;
    case 'trash':
      return project.trashedAt != null;
    case 'logbook':
      return project.status === ProjectStatus.COMPLETED && project.trashedAt == null;
    default:
      return false;
  }
}

/** feed 是否包含项目行。 */
export function feedIncludesProjects(view: ListView): boolean {
  return view !== 'inbox' && view !== 'anytime';
}

/** 任务列表查询（GET /tasks 与设备 getTasks）。 */
export interface TaskListQuery {
  q?: string;
  view?: ListView;
  projectId?: string;
  areaId?: string;
  tagId?: string;
  completed?: boolean;
  hasScheduled?: boolean;
}

export interface TaskQueryFields extends TaskViewFields {
  title: unknown;
  notes: unknown;
  projectId: unknown;
  areaId: unknown;
  /** 自身 Tag；tagId 查询按有效 Tag（并上所属 Project / Area 的 Tag）判定。 */
  tagIds: readonly string[];
}

function includesText(value: unknown, needle: string): boolean {
  return typeof value === 'string' && value.toLowerCase().includes(needle);
}

/**
 * - q：标题或备注包含（不区分大小写）；与 view 可叠加。
 * - view：按视图判定，忽略其余条件。
 * - 否则按归属 / 标签 / 有计划日期过滤；状态默认只含未了结，completed
 *   时含已了结（搜索时为 ACTIVE + 已了结三值，ADR 0006）。均不含 Trash。
 * - tagId 按有效 Tag 判定（ADR 0015），此时必须传入 parents。
 */
export function taskMatchesQuery(
  task: TaskQueryFields,
  query: TaskListQuery,
  context: CalendarContext,
  parents?: TagParents,
): boolean {
  if (query.q) {
    const needle = query.q.toLowerCase();
    if (!includesText(task.title, needle) && !includesText(task.notes, needle)) return false;
  }
  if (query.view) return taskMatchesView(task, query.view, context);
  if (query.projectId && task.projectId !== query.projectId) return false;
  if (query.areaId && task.areaId !== query.areaId) return false;
  if (query.tagId) {
    if (!parents) throw new Error('taskMatchesQuery: tagId 查询需要 TagParents');
    if (!effectiveTaskTagIds(task, parents).includes(query.tagId)) return false;
  }
  if (query.hasScheduled === true && task.scheduledDate == null) return false;
  if (task.trashedAt != null) return false;
  if (query.q && query.completed) {
    return WITH_SETTLED_TASK_STATUSES.includes(task.status as TaskStatus);
  }
  return query.completed ? true : task.status === TaskStatus.ACTIVE;
}

/**
 * 列表顺序：Logbook 按了结时间倒序，其余按有效 Position。平局按 id，
 * 两端稳定。settledAtOf 取了结时间（Task 行是 settledAt，DTO / feed 行
 * 沿用 completedAt）。
 */
export function sortForView<T extends Positioned & { id: string }>(
  items: readonly T[],
  view: ListView | undefined,
  settledAtOf: (item: T) => unknown,
): T[] {
  if (view !== 'logbook') return sortByEffectivePosition(items);
  return [...items].sort(
    (a, b) =>
      (instantMs(settledAtOf(b)) ?? 0) - (instantMs(settledAtOf(a)) ?? 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * feed 顺序：Logbook 同 sortForView；其余视图任务与项目混排，按 feed
 * 排序键（feedSortKey：项目优先用 Feed Position）。平局按 id，两端稳定。
 */
export function sortFeedItems<
  T extends FeedPositioned & { id: string; completedAt?: Date | string | null },
>(items: readonly T[], view: ListView): T[] {
  if (view === 'logbook') return sortForView(items, view, (item) => item.completedAt);
  const keyed = items.map((item) => ({ item, key: feedSortKey(item) }));
  keyed.sort(
    (a, b) =>
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  );
  return keyed.map(({ item }) => item);
}

/** 项目进度计数的任务字段。 */
export interface CountedTaskFields {
  projectId: unknown;
  status: unknown;
  trashedAt: unknown;
}

/**
 * 项目进度：项目下所有非 Trash 任务的总数 / 已了结数（完成 + 取消，
 * 与 Logbook 口径一致，ADR 0006）。不受视图过滤影响。
 */
export function countProjectTasks(
  projectIds: readonly string[],
  tasks: readonly CountedTaskFields[],
): Map<string, { total: number; completed: number }> {
  const counts = new Map(projectIds.map((id) => [id, { total: 0, completed: 0 }]));
  for (const task of tasks) {
    if (task.trashedAt != null || typeof task.projectId !== 'string') continue;
    const entry = counts.get(task.projectId);
    if (!entry) continue;
    entry.total += 1;
    if (isSettledTask(task.status)) entry.completed += 1;
  }
  return counts;
}
