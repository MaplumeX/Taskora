/**
 * Task / Subtask 的写入规则：给定当前状态与操作，返回要写的字段。
 *
 * 设备（Engine 后端）与 hub（REST 服务）都只做「读 → 调这里 → 写」。
 * 字段是线上（wire）形态：日历日期为 `YYYY-MM-DD` 日期键，时间戳为
 * ISO 字符串，重复规则为规范化对象；REST 侧在写 Postgres 时换成 Date /
 * 规范 JSON 文本。排序位次（Position / sortOrder）是存储问题，不在此。
 */

import {
  ProjectStatus,
  ScheduledType,
  SETTLED_TASK_STATUSES,
  TaskBucket,
  TaskStatus,
  type CreateTaskDto,
  type RepeatRule,
  type UpdateTaskDto,
} from '@taskora/shared';

import { normalizeRepeatRule } from '../repeat';
import { resolveProjectBucket, resolveTaskBucket } from './bucket';
import { dateKeyOf, type CalendarZones } from './calendar';

/** Task 的领域字段（wire 形态）。 */
export interface TaskFields {
  title: string;
  notes: string | null;
  scheduledType: ScheduledType;
  scheduledDate: string | null;
  reminderTime: string | null;
  repeatRule: RepeatRule | null;
  dueDate: string | null;
  bucket: TaskBucket;
  status: TaskStatus;
  settledAt: string | null;
  trashedAt: string | null;
  projectId: string | null;
  headingId: string | null;
  areaId: string | null;
  tagIds: string[];
}

export type TaskPatch = Partial<TaskFields>;

/** 新建任务：未指定计划类型为 NONE；只有 DATE 带计划日期；无提醒与重复。 */
export function planTaskCreate(input: CreateTaskDto, zones: CalendarZones): TaskFields {
  const scheduledType = input.scheduledType ?? ScheduledType.NONE;
  return {
    title: input.title,
    notes: input.notes ?? null,
    scheduledType,
    scheduledDate:
      scheduledType === ScheduledType.DATE ? dateKeyOf(input.scheduledDate, zones) : null,
    reminderTime: null,
    repeatRule: null,
    dueDate: dateKeyOf(input.dueDate, zones),
    bucket: resolveTaskBucket(input.bucket, scheduledType, input.projectId, input.areaId),
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
  scheduledType: unknown;
  scheduledDate: unknown;
  bucket: unknown;
  projectId: string | null;
  areaId: string | null;
  headingId: string | null;
}

/**
 * 编辑任务：
 * - 改计划（类型或日期）时两者一起写；NONE / SOMEDAY 没有计划日期，
 *   换成 DATE 而未给日期时沿用原日期。
 * - 离开 DATE 清除提醒与重复规则（无锚即无意义，reminders / recurring-tasks
 *   spec）；DATE 下按输入写，重复规则写入前规范化，非法对象忽略。
 * - Bucket 按新的计划类型与归属重新推导，有变化或显式改计划 / Bucket 时写。
 * - 换项目解除分组归属（分组只属于原项目）。
 */
export function planTaskUpdate(
  existing: TaskUpdateBase,
  input: UpdateTaskDto,
  zones: CalendarZones,
): TaskPatch {
  const patch: TaskPatch = {};
  const scheduledType = (input.scheduledType ?? existing.scheduledType) as ScheduledType;
  const schedulingChanged = input.scheduledType !== undefined || input.scheduledDate !== undefined;

  if (input.title !== undefined) patch.title = input.title;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (schedulingChanged) {
    patch.scheduledType = scheduledType;
    patch.scheduledDate =
      scheduledType !== ScheduledType.DATE
        ? null
        : input.scheduledDate !== undefined
          ? dateKeyOf(input.scheduledDate, zones)
          : dateKeyOf(existing.scheduledDate, zones);
  }
  if (scheduledType !== ScheduledType.DATE) {
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

  const projectId = input.projectId !== undefined ? input.projectId : existing.projectId;
  const areaId = input.areaId !== undefined ? input.areaId : existing.areaId;
  if (
    schedulingChanged ||
    input.bucket !== undefined ||
    input.projectId !== undefined ||
    input.areaId !== undefined
  ) {
    const bucket = resolveTaskBucket(
      input.bucket ?? existing.bucket,
      scheduledType,
      projectId,
      areaId,
    );
    if (schedulingChanged || input.bucket !== undefined || bucket !== existing.bucket) {
      patch.bucket = bucket;
    }
  }
  if (input.projectId !== undefined) patch.projectId = input.projectId;
  if (input.areaId !== undefined) patch.areaId = input.areaId;
  if (input.tagIds !== undefined) patch.tagIds = input.tagIds;
  if (
    input.projectId !== undefined &&
    input.projectId !== existing.projectId &&
    existing.headingId != null
  ) {
    patch.headingId = null;
  }
  return patch;
}

// ---------- 生命周期（CONTEXT：Completed / Cancelled / Trash，ADR 0006） ----------

/** 移入 Trash：被丢弃的工作不再提醒。 */
export function taskTrashPatch(now: string): TaskPatch {
  return { trashedAt: now, reminderTime: null };
}

/** 从 Trash 恢复：「捡回」一律回到未了结，与终态正交。 */
export function taskRestorePatch(): TaskPatch {
  return { trashedAt: null, status: TaskStatus.ACTIVE, settledAt: null };
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
  scheduledType: unknown;
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
  scheduledType: ScheduledType;
  scheduledDate: string | null;
  dueDate: string | null;
  bucket: ReturnType<typeof resolveProjectBucket>;
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
 * Inbox 任务，保留标题、状态与了结时间。原任务随后物理删除（调用方）。
 */
export function planConvertTaskToProject(
  task: ConvertibleTask,
  parentProjectAreaId: string | null,
  subtasks: readonly ConvertibleSubtask[],
  zones: CalendarZones,
): { project: ConvertedProjectFields; promotedTasks: TaskFields[] } {
  const completed = task.status === TaskStatus.COMPLETED;
  const scheduledType = (task.scheduledType as ScheduledType) ?? ScheduledType.NONE;
  const project: ConvertedProjectFields = {
    title: task.title,
    notes: task.notes,
    scheduledType,
    scheduledDate:
      scheduledType === ScheduledType.DATE ? dateKeyOf(task.scheduledDate, zones) : null,
    dueDate: dateKeyOf(task.dueDate, zones),
    bucket: resolveProjectBucket(scheduledType),
    status: completed ? ProjectStatus.COMPLETED : ProjectStatus.ACTIVE,
    completedAt: completed ? task.settledAt : null,
    trashedAt: task.trashedAt,
    areaId: task.areaId ?? parentProjectAreaId,
    tagIds: [...task.tagIds],
  };
  const promotedTasks = subtasks.map((subtask): TaskFields => ({
    title: subtask.title,
    notes: null,
    scheduledType: ScheduledType.NONE,
    scheduledDate: null,
    reminderTime: null,
    repeatRule: null,
    dueDate: null,
    bucket: TaskBucket.INBOX,
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
