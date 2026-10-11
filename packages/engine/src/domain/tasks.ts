/**
 * Task / Subtask 的写入规则：给定当前状态与操作，返回要写的字段。
 *
 * 设备（Engine 后端）与 hub（REST 服务）都只做「读 → 调这里 → 写」。
 * 字段是线上（wire）形态：日历日期为 `YYYY-MM-DD` 日期键，时间戳为
 * ISO 字符串，重复规则为规范化对象；REST 侧在写 Postgres 时换成 Date /
 * 规范 JSON 文本。排序位次（Position）是存储问题，不在此。
 */

import {
  ProjectStatus,
  SETTLED_TASK_STATUSES,
  Start,
  TaskStatus,
  type CreateTaskDto,
  type RepeatRule,
  type UpdateTaskDto,
  type ReviewInterval,
} from '@taskora/shared';

import { normalizeRepeatRule } from '../repeat';
import { dateKeyOf, type CalendarZones } from './calendar';
import { planReviewSchedule, type ReviewContext } from './review';
import { resolveProjectStart, resolveTaskStart } from './start';

/** Task 的领域字段（wire 形态）。 */
export interface TaskFields {
  title: string;
  notes: string | null;
  start: Start;
  scheduledDate: string | null;
  reminderTime: string | null;
  repeatRule: RepeatRule | null;
  /** 派生来源：派生出本实例的重复任务 id（recurring-tasks-v2）；非派生为 null。 */
  repeatSourceId: string | null;
  dueDate: string | null;
  status: TaskStatus;
  settledAt: string | null;
  trashedAt: string | null;
  projectId: string | null;
  headingId: string | null;
  areaId: string | null;
  tagIds: string[];
}

export type TaskPatch = Partial<TaskFields>;

/**
 * 新建任务：Someday 不带计划日期；未指定 start 时无归属、无日期落 Inbox，
 * 否则 Anytime（resolveTaskStart）；无提醒与重复。
 */
export function planTaskCreate(input: CreateTaskDto, zones: CalendarZones): TaskFields {
  const scheduledDate =
    input.start === Start.SOMEDAY ? null : dateKeyOf(input.scheduledDate, zones);
  return {
    title: input.title,
    notes: input.notes ?? null,
    start: resolveTaskStart(input.start, scheduledDate, input.projectId, input.areaId),
    scheduledDate,
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    dueDate: dateKeyOf(input.dueDate, zones),
    status: TaskStatus.ACTIVE,
    settledAt: null,
    trashedAt: null,
    projectId: input.projectId ?? null,
    headingId: null,
    areaId: input.areaId ?? null,
    tagIds: input.tagIds ?? [],
  };
}

/** planTaskUpdate 需要的现有字段（日期可为存储形态）。 */
export interface TaskUpdateBase {
  start: unknown;
  scheduledDate: unknown;
  projectId: string | null;
  areaId: string | null;
  headingId: string | null;
  /** 在 Trash 中（非空）时，改日期 / 归属 / 标签等编辑会隐式放回。 */
  trashedAt?: unknown;
}

/**
 * 在 Trash 中编辑时是否隐式放回：改计划（start / 日期）、提醒、重复、截止日期、
 * 归属或标签即放回；只改标题 / 备注不放回（状态与子任务走各自的写入，
 * 同样不放回）。
 */
export function taskUpdatePutsBack(input: UpdateTaskDto): boolean {
  return (
    input.start !== undefined ||
    input.scheduledDate !== undefined ||
    input.reminderTime !== undefined ||
    input.repeatRule !== undefined ||
    input.dueDate !== undefined ||
    input.projectId !== undefined ||
    input.areaId !== undefined ||
    input.tagIds !== undefined
  );
}

/**
 * 编辑任务（ADR 0024）：
 * - 改计划（start 或日期）时两者一起写。设日期即 ANYTIME；SOMEDAY 清除
 *   日期；ANYTIME 未给日期时沿用原日期（Clear 显式给 null）。
 * - 移入 Inbox（start 为 INBOX）同时清除归属与计划，截止日期保留；同一次
 *   编辑给了归属或日期时整理优先，落 Anytime（resolveTaskStart）。
 * - 没有计划日期时清除提醒与重复规则（无锚即无意义，reminders / recurring-tasks
 *   spec）；有日期时按输入写，重复规则写入前规范化，非法对象忽略。
 * - 归属变化时 start 按归属重新推导（Inbox 任务获得归属转入 Anytime）。
 * - 换项目解除分组归属（分组只属于原项目）。
 * - 在 Trash 中时，taskUpdatePutsBack 的编辑同时放回（清 trashedAt）。
 */
export function planTaskUpdate(
  existing: TaskUpdateBase,
  input: UpdateTaskDto,
  zones: CalendarZones,
): TaskPatch {
  const patch: TaskPatch = {};
  const toInbox = input.start === Start.INBOX;
  const schedulingChanged = input.start !== undefined || input.scheduledDate !== undefined;

  if (input.title !== undefined) patch.title = input.title;
  if (input.notes !== undefined) patch.notes = input.notes;

  let scheduledDate =
    input.start === Start.SOMEDAY || toInbox ? null : dateKeyOf(existing.scheduledDate, zones);
  if (input.scheduledDate !== undefined && input.start !== Start.SOMEDAY) {
    scheduledDate = dateKeyOf(input.scheduledDate, zones);
  }
  const projectId =
    input.projectId !== undefined ? input.projectId : toInbox ? null : existing.projectId;
  const areaId = input.areaId !== undefined ? input.areaId : toInbox ? null : existing.areaId;
  const start = resolveTaskStart(
    input.start ?? (scheduledDate != null ? Start.ANYTIME : existing.start),
    scheduledDate,
    projectId,
    areaId,
  );
  if (schedulingChanged) {
    patch.start = start;
    patch.scheduledDate = scheduledDate;
  } else if (start !== existing.start) {
    patch.start = start;
  }
  if (scheduledDate == null) {
    patch.reminderTime = null;
    patch.repeatRule = null;
  } else {
    if (input.reminderTime !== undefined) patch.reminderTime = input.reminderTime;
    if (input.repeatRule !== undefined) {
      const normalized = normalizeRepeatRule(input.repeatRule);
      if (input.repeatRule === null || normalized !== null) patch.repeatRule = normalized;
    }
  }
  if (input.dueDate !== undefined) patch.dueDate = dateKeyOf(input.dueDate, zones);

  if (input.projectId !== undefined || toInbox) patch.projectId = projectId;
  if (input.areaId !== undefined || toInbox) patch.areaId = areaId;
  if (input.tagIds !== undefined) patch.tagIds = input.tagIds;
  if (projectId !== (existing.projectId ?? null) && existing.headingId != null) {
    patch.headingId = null;
  }
  if (existing.trashedAt != null && taskUpdatePutsBack(input)) patch.trashedAt = null;
  return patch;
}

// ---------- 生命周期（CONTEXT：Completed / Cancelled / Trash，ADR 0006） ----------

/** 移入 Trash：被丢弃的工作不再提醒。 */
export function taskTrashPatch(now: string): TaskPatch {
  return { trashedAt: now, reminderTime: null };
}

/**
 * 放回（从 Trash 恢复）：只清 trashedAt，回到删除前的位置与状态——已了结
 * 的回到 Logbook。进 Trash 时清掉的提醒不恢复。
 */
export function taskRestorePatch(): TaskPatch {
  return { trashedAt: null };
}

/**
 * 完成：写 COMPLETED + 了结时间、清除提醒，并派生下一个 Repeat
 * Instance（结算副作用）。已完成的任务再次完成（双击 / 重试）不做任何
 * 事：刷新了结时间会让「按完成日期」的规则算出另一个实例。
 */
export function planTaskComplete(
  currentStatus: unknown,
  now: string,
): { patch: TaskPatch; deriveRepeat: boolean } | null {
  if (currentStatus === TaskStatus.COMPLETED) return null;
  return {
    patch: { status: TaskStatus.COMPLETED, settledAt: now, reminderTime: null },
    deriveRepeat: true,
  };
}

/** 取消：终态可直接改写（完成 → 取消刷新了结时间）；不派生，链就此终结。 */
export function taskCancelPatch(now: string): TaskPatch {
  return { status: TaskStatus.CANCELLED, settledAt: now, reminderTime: null };
}

/** 重开（取消完成 / 取消取消）：回到未了结；调用方同时删除已派生的实例。 */
export function taskReopenPatch(): TaskPatch {
  return { status: TaskStatus.ACTIVE, settledAt: null };
}

/** Subtask 状态：终态写了结时间，回到 ACTIVE 清空。 */
export function subtaskStatusPatch(
  status: TaskStatus,
  now: string,
): { status: TaskStatus; settledAt: string | null } {
  return { status, settledAt: SETTLED_TASK_STATUSES.includes(status) ? now : null };
}

// ---------- 转为项目（CONTEXT：Convert to Project） ----------

export interface ConvertibleTask {
  title: string;
  notes: string | null;
  start: unknown;
  scheduledDate: unknown;
  dueDate: unknown;
  status: unknown;
  settledAt: string | null;
  trashedAt: string | null;
  areaId: string | null;
  tagIds: readonly string[];
}

export interface ConvertibleSubtask {
  title: string;
  status: unknown;
  settledAt: string | null;
}

export interface ConvertedProjectFields {
  title: string;
  notes: string | null;
  start: Start;
  scheduledDate: string | null;
  dueDate: string | null;
  reviewInterval: ReviewInterval;
  nextReviewDate: string;
  lastReviewedOn: null;
  status: ProjectStatus;
  completedAt: string | null;
  trashedAt: string | null;
  areaId: string | null;
  tagIds: string[];
}

/**
 * 任务转项目：新项目继承标题 / 备注 / 计划 / 截止 / 标签 / Trash 状态；
 * 区域取任务的，没有则取原所属项目的；完成的任务得到完成的项目（项目
 * 没有取消态，取消的任务得到未完成的项目）。Subtask 提升为新项目下的
 * Anytime 任务（有归属即不在 Inbox，CONTEXT：Inbox），保留标题、状态与
 * 了结时间。原任务随后物理删除（调用方）。
 */
export function planConvertTaskToProject(
  task: ConvertibleTask,
  parentProjectAreaId: string | null,
  subtasks: readonly ConvertibleSubtask[],
  zones: CalendarZones,
  review: ReviewContext,
): { project: ConvertedProjectFields; promotedTasks: TaskFields[] } {
  const completed = task.status === TaskStatus.COMPLETED;
  const start = resolveProjectStart(task.start);
  const project: ConvertedProjectFields = {
    title: task.title,
    notes: task.notes,
    start,
    scheduledDate: start === Start.SOMEDAY ? null : dateKeyOf(task.scheduledDate, zones),
    dueDate: dateKeyOf(task.dueDate, zones),
    ...planReviewSchedule(review, 'project'),
    status: completed ? ProjectStatus.COMPLETED : ProjectStatus.ACTIVE,
    completedAt: completed ? task.settledAt : null,
    trashedAt: task.trashedAt,
    areaId: task.areaId ?? parentProjectAreaId,
    tagIds: [...task.tagIds],
  };
  const promotedTasks = subtasks.map((subtask): TaskFields => ({
    title: subtask.title,
    notes: null,
    start: Start.ANYTIME,
    scheduledDate: null,
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    dueDate: null,
    status: (subtask.status as TaskStatus) ?? TaskStatus.ACTIVE,
    settledAt: subtask.settledAt,
    trashedAt: null,
    projectId: null, // 调用方填入新项目 id
    headingId: null,
    areaId: null,
    tagIds: [],
  }));
  return { project, promotedTasks };
}
