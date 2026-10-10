/**
 * 视图规则（CONTEXT：Inbox / Today / Upcoming / Anytime / Someday /
 * Logbook / Trash / Deadlines / Repeating）：一个任务或项目是否出现在某个视图里、feed 怎么排。
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

import {
  dateKeyOf,
  instantMs,
  todayKey,
  type CalendarContext,
  type CalendarZones,
} from './calendar';
import { settledIsLogged, type ViewContext } from './logging';
import {
  feedSortKey,
  sortByEffectivePosition,
  type FeedPositioned,
  type Positioned,
} from './order';
import { effectiveTaskTagIds, tagHit, type TagParents } from './tags';

export type ListView =
  | 'inbox'
  | 'today'
  | 'upcoming'
  | 'anytime'
  | 'someday'
  | 'trash'
  | 'logbook'
  | 'deadlines'
  | 'repeating';

/** 视图判定用到的字段（两端存储形态：日期可为 Date 或字符串）。 */
export interface ViewFields {
  status: unknown;
  scheduledType: unknown;
  scheduledDate: unknown;
  /** 截止日期 ≤ 今天的未了结条目也进 Today（对齐 Things 3）。 */
  dueDate: unknown;
  trashedAt: unknown;
  /** Repeating 收录带 Repeat Rule 的条目；其余视图不看它。 */
  repeatRule?: unknown;
  /**
   * 了结时间，判定是否已移入 Logbook（Logging Mode，ADR 0022）。Task 行是
   * settledAt，Project 行与 DTO 是 completedAt，两者取其一。
   */
  settledAt?: unknown;
  completedAt?: unknown;
}

export interface TaskViewFields extends ViewFields {
  bucket: unknown;
}

/**
 * 只有 Today / Upcoming 依赖「今天」，Deadlines / Repeating 按截止日期 /
 * 计划日期的日历日排序；其余视图不必查账号时区。
 */
export function viewNeedsCalendar(view: string | undefined): boolean {
  return view === 'today' || view === 'upcoming' || view === 'deadlines' || view === 'repeating';
}

function isSettledTask(status: unknown): boolean {
  return SETTLED_TASK_STATUSES.includes(status as TaskStatus);
}

function settledAtOf(fields: ViewFields): unknown {
  return fields.settledAt ?? fields.completedAt;
}

/**
 * 留在原视图里的任务：未了结，或已了结但尚未移入 Logbook（Unlogged Item）；
 * 都不在 Trash 里。
 */
function listedTask(task: ViewFields, context: ViewContext): boolean {
  if (task.trashedAt != null) return false;
  if (task.status === TaskStatus.ACTIVE) return true;
  return isSettledTask(task.status) && !settledIsLogged(settledAtOf(task), context);
}

function listedProject(project: ViewFields, context: ViewContext): boolean {
  if (project.trashedAt != null) return false;
  if (project.status === ProjectStatus.ACTIVE) return true;
  return (
    project.status === ProjectStatus.COMPLETED && !settledIsLogged(settledAtOf(project), context)
  );
}

/** DATE 计划相对「今天」的位置：today（今天及以前）/ upcoming / null（不适用）。 */
function datePlacement(fields: ViewFields, context: CalendarContext): 'today' | 'upcoming' | null {
  if (fields.scheduledType !== ScheduledType.DATE) return null;
  const day = dateKeyOf(fields.scheduledDate, context);
  if (day === null) return null;
  return day <= todayKey(context) ? 'today' : 'upcoming';
}

/** 截止日期已到（今天或已过）。 */
function deadlineReached(fields: ViewFields, context: CalendarContext): boolean {
  const day = dateKeyOf(fields.dueDate, context);
  return day !== null && day <= todayKey(context);
}

/** Today：计划日期或截止日期 ≤ 今天。 */
function inToday(fields: ViewFields, context: CalendarContext): boolean {
  return datePlacement(fields, context) === 'today' || deadlineReached(fields, context);
}

/**
 * Deadlines / Repeating 只列未了结条目；其余排期 / 收纳视图还留着尚未移入 Logbook 的
 * 已了结条目，Logbook 只收已移入的（Logging Mode，ADR 0022）。
 */
export function taskMatchesView(
  task: TaskViewFields,
  view: ListView,
  context: ViewContext,
): boolean {
  const open = task.status === TaskStatus.ACTIVE && task.trashedAt == null;
  const listed = listedTask(task, context);
  switch (view) {
    case 'inbox':
      return (
        listed && task.bucket === TaskBucket.INBOX && task.scheduledType === ScheduledType.NONE
      );
    case 'anytime':
      return (
        listed && task.bucket === TaskBucket.ANYTIME && task.scheduledType === ScheduledType.NONE
      );
    case 'today':
      return listed && inToday(task, context);
    case 'upcoming':
      return listed && datePlacement(task, context) === 'upcoming';
    case 'someday':
      return listed && task.scheduledType === ScheduledType.SOMEDAY;
    case 'trash':
      return task.trashedAt != null;
    case 'logbook':
      return (
        isSettledTask(task.status) &&
        task.trashedAt == null &&
        settledIsLogged(settledAtOf(task), context)
      );
    case 'deadlines':
      return open && dateKeyOf(task.dueDate, context) !== null;
    case 'repeating':
      return open && task.repeatRule != null;
    default:
      return false;
  }
}

/** Project 只出现在排期与终态视图（Inbox / Anytime 不含项目）。 */
export function projectMatchesView(
  project: ViewFields,
  view: ListView,
  context: ViewContext,
): boolean {
  const open = project.status === ProjectStatus.ACTIVE && project.trashedAt == null;
  const listed = listedProject(project, context);
  switch (view) {
    case 'today':
      return listed && inToday(project, context);
    case 'upcoming':
      return listed && datePlacement(project, context) === 'upcoming';
    case 'someday':
      return listed && project.scheduledType === ScheduledType.SOMEDAY;
    case 'trash':
      return project.trashedAt != null;
    case 'logbook':
      return (
        project.status === ProjectStatus.COMPLETED &&
        project.trashedAt == null &&
        settledIsLogged(settledAtOf(project), context)
      );
    case 'deadlines':
      return open && dateKeyOf(project.dueDate, context) !== null;
    case 'repeating':
      return open && project.repeatRule != null;
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
 * - 否则按归属 / 标签 / 有计划日期过滤；状态默认只含未了结与 Unlogged Item，completed
 *   时含已了结（搜索时为 ACTIVE + 已了结三值，ADR 0006）。均不含 Trash。
 * - tagId 按有效 Tag 判定（ADR 0015），命中该 Tag 的整棵子树（ADR-0016），
 *   此时必须传入 parents。
 */
export function taskMatchesQuery(
  task: TaskQueryFields,
  query: TaskListQuery,
  context: ViewContext,
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
    if (!tagHit(effectiveTaskTagIds(task, parents), query.tagId, parents)) return false;
  }
  if (query.hasScheduled === true && task.scheduledDate == null) return false;
  if (task.trashedAt != null) return false;
  if (query.q && query.completed) {
    return WITH_SETTLED_TASK_STATUSES.includes(task.status as TaskStatus);
  }
  return query.completed ? true : listedTask(task, context);
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

/** 先按日历日排序的视图：Deadlines 按截止日期，Repeating 按计划日期（下一次出现）。 */
const DAY_SORTED_VIEWS: Partial<Record<ListView, 'dueDate' | 'scheduledDate'>> = {
  deadlines: 'dueDate',
  repeating: 'scheduledDate',
};

/**
 * feed 顺序：Logbook 同 sortForView；Deadlines / Repeating 先按截止日期 /
 * 计划日期升序（逾期的自然在最前），同一天内按 feed 排序键；其余视图任务
 * 与项目混排，按 feed 排序键（feedSortKey：项目优先用 Feed Position）。
 * 平局按 id，两端稳定。按日期排的视图需要 zones 把日期换成日历日。
 */
export function sortFeedItems<
  T extends FeedPositioned & {
    id: string;
    completedAt?: Date | string | null;
    dueDate?: unknown;
    scheduledDate?: unknown;
  },
>(items: readonly T[], view: ListView, zones?: CalendarZones): T[] {
  if (view === 'logbook') return sortForView(items, view, (item) => item.completedAt);
  const dayField = DAY_SORTED_VIEWS[view];
  if (dayField && !zones) throw new Error(`sortFeedItems: ${view} 需要 zones`);
  const dayOf = (item: T) => (dayField ? (dateKeyOf(item[dayField], zones!) ?? '') : '');
  const keyed = items.map((item) => ({ item, day: dayOf(item), key: feedSortKey(item) }));
  keyed.sort(
    (a, b) =>
      (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) ||
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
