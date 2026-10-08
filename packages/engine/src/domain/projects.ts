/**
 * Project 的写入规则与 Trash 级联（形态约定见 tasks.ts 顶部）。
 */

import {
  ProjectStatus,
  ScheduledType,
  TaskStatus,
  type CreateProjectDto,
  type ProjectBucket,
  type RepeatRule,
  type ReviewInterval,
  type SettleRemainingTasks,
  type UpdateProjectDto,
} from '@taskora/shared';

import { normalizeRepeatRule } from '../repeat';
import { resolveProjectBucket } from './bucket';
import { dateKeyOf, instantMs, type CalendarZones } from './calendar';
import {
  planReviewSchedule,
  planReviewUpdate,
  type ReviewContext,
  type ReviewUpdateBase,
} from './review';
import { taskTrashPatch, type TaskPatch } from './tasks';

export interface ProjectFields {
  title: string;
  notes: string | null;
  scheduledType: ScheduledType;
  scheduledDate: string | null;
  dueDate: string | null;
  /** 重复规则（recurring-projects spec）：仅 DATE 项目可设。 */
  repeatRule: RepeatRule | null;
  /** 派生来源：派生出本项目的重复项目 id；非派生为 null。 */
  repeatSourceId: string | null;
  /** 回顾间隔（Review Interval）。 */
  reviewInterval: ReviewInterval | null;
  /** 下次回顾日（日期键）。 */
  nextReviewDate: string | null;
  /** 上次回顾日（日期键）；null 为从未回顾。 */
  lastReviewedOn: string | null;
  bucket: ProjectBucket;
  status: ProjectStatus;
  completedAt: string | null;
  trashedAt: string | null;
  areaId: string | null;
  tagIds: string[];
}

export type ProjectPatch = Partial<ProjectFields>;

export function planProjectCreate(
  input: CreateProjectDto,
  zones: CalendarZones,
  review: ReviewContext,
): ProjectFields {
  const scheduledType = input.scheduledType ?? ScheduledType.NONE;
  return {
    title: input.title,
    notes: input.notes ?? null,
    scheduledType,
    scheduledDate:
      scheduledType === ScheduledType.DATE ? dateKeyOf(input.scheduledDate, zones) : null,
    dueDate: dateKeyOf(input.dueDate, zones),
    repeatRule: null,
    repeatSourceId: null,
    ...planReviewSchedule(review, 'project', input, zones),
    bucket: resolveProjectBucket(scheduledType),
    status: ProjectStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    areaId: input.areaId ?? null,
    tagIds: input.tagIds ?? [],
  };
}

export interface ProjectUpdateBase extends ReviewUpdateBase {
  scheduledType: unknown;
  scheduledDate: unknown;
  bucket: unknown;
}

/**
 * 编辑项目：计划规则同任务（无提醒）——离开 DATE 清除重复规则，DATE 下
 * 规则写入前规范化、非法对象忽略；Bucket 只由计划类型决定。回顾设置见
 * planReviewUpdate。
 */
export function planProjectUpdate(
  existing: ProjectUpdateBase,
  input: UpdateProjectDto,
  zones: CalendarZones,
  review: ReviewContext,
): ProjectPatch {
  const patch: ProjectPatch = {};
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
    patch.repeatRule = null;
  } else if (input.repeatRule !== undefined) {
    const normalized = normalizeRepeatRule(input.repeatRule);
    if (input.repeatRule === null || normalized !== null) patch.repeatRule = normalized;
  }
  if (input.dueDate !== undefined) patch.dueDate = dateKeyOf(input.dueDate, zones);
  const bucket = resolveProjectBucket(scheduledType);
  if (schedulingChanged || input.bucket !== undefined || bucket !== existing.bucket) {
    patch.bucket = bucket;
  }
  if (input.areaId !== undefined) patch.areaId = input.areaId;
  if (input.tagIds !== undefined) patch.tagIds = input.tagIds;
  Object.assign(patch, planReviewUpdate(existing, input, 'project', review, zones));
  return patch;
}

/**
 * 在 Trash 中编辑项目时是否隐式放回（规则同 taskUpdatePutsBack）：改计划、
 * 重复规则、截止日期、Bucket、区域或标签即放回，调用方按 planProjectRestore 级联；
 * 只改标题 / 备注不放回。
 */
export function projectUpdatePutsBack(input: UpdateProjectDto): boolean {
  return (
    input.scheduledType !== undefined ||
    input.scheduledDate !== undefined ||
    input.repeatRule !== undefined ||
    input.dueDate !== undefined ||
    input.bucket !== undefined ||
    input.areaId !== undefined ||
    input.tagIds !== undefined
  );
}

export function projectCompletePatch(now: string): ProjectPatch {
  return { status: ProjectStatus.COMPLETED, completedAt: now };
}

export interface ProjectCompleteTask {
  id: string;
  status: unknown;
  trashedAt: unknown;
}

/**
 * 完成项目（recurring-projects spec）：项目写 COMPLETED；给出
 * settleRemaining 时，项目内未了结、未进 Trash 的任务一并以同一了结时间
 * 完成 / 取消（清除提醒，Things 3 的「剩余任务」询问）。整体收尾不派生
 * 任务的 Repeat Instance——实例会落进已完成的项目（同 planHeadingArchive）。
 * 已完成的项目再次完成（双击 / 重试）返回 null：刷新完成时间会让
 * 「按完成日期」的规则算出另一个实例。
 */
export function planProjectComplete(
  currentStatus: unknown,
  now: string,
  tasks: readonly ProjectCompleteTask[],
  settleRemaining?: SettleRemainingTasks,
): {
  project: ProjectPatch;
  tasks: Array<{ id: string; patch: TaskPatch }>;
  deriveRepeat: boolean;
} | null {
  if (currentStatus === ProjectStatus.COMPLETED) return null;
  const status =
    settleRemaining === 'completed'
      ? TaskStatus.COMPLETED
      : settleRemaining === 'cancelled'
        ? TaskStatus.CANCELLED
        : null;
  return {
    project: projectCompletePatch(now),
    tasks:
      status === null
        ? []
        : tasks
            .filter((task) => task.status === TaskStatus.ACTIVE && task.trashedAt == null)
            .map((task) => ({
              id: task.id,
              patch: { status, settledAt: now, reminderTime: null },
            })),
    deriveRepeat: true,
  };
}

export function projectReopenPatch(): ProjectPatch {
  return { status: ProjectStatus.ACTIVE, completedAt: null };
}

export interface TrashableTask {
  id: string;
  trashedAt: unknown;
}

/**
 * 项目进 Trash：项目与其下仍在外面的任务拿到同一个时间戳（恢复时据此
 * 认出「随项目一起进去的」）。已经在 Trash 里的任务不动——改写它们的
 * 时间戳会让恢复项目时把它们也捡回来。
 */
export function planProjectTrash(
  now: string,
  tasks: readonly TrashableTask[],
): { project: ProjectPatch; tasks: Array<{ id: string; patch: TaskPatch }> } {
  return {
    project: { trashedAt: now },
    tasks: tasks
      .filter((task) => task.trashedAt == null)
      .map((task) => ({ id: task.id, patch: taskTrashPatch(now) })),
  };
}

/**
 * 项目恢复：只捡回与项目同一时刻进 Trash 的任务；项目进 Trash 前后
 * 单独删掉的任务保持原状。时间戳按时刻比较（两端存储形态不同）。
 */
export function planProjectRestore(
  projectTrashedAt: unknown,
  tasks: readonly TrashableTask[],
): { project: ProjectPatch; tasks: Array<{ id: string; patch: TaskPatch }> } {
  const cascadeMs = instantMs(projectTrashedAt);
  return {
    project: { trashedAt: null },
    tasks:
      cascadeMs === null
        ? []
        : tasks
            .filter((task) => instantMs(task.trashedAt) === cascadeMs)
            .map((task) => ({ id: task.id, patch: { trashedAt: null } })),
  };
}

/**
 * 清空 Trash：物理删除 Trash 里的任务与项目，以及 Trash 里项目下的
 * 全部任务（不论任务自身是否在 Trash）。Subtask / 分组随父实体级联。
 */
export function planEmptyTrash(
  projects: ReadonlyArray<{ id: string; trashedAt: unknown }>,
  tasks: ReadonlyArray<{ id: string; projectId: unknown; trashedAt: unknown }>,
): { taskIds: string[]; projectIds: string[] } {
  const projectIds = projects.filter((project) => project.trashedAt != null).map((p) => p.id);
  const trashedProjects = new Set(projectIds);
  const taskIds = tasks
    .filter(
      (task) =>
        task.trashedAt != null ||
        (typeof task.projectId === 'string' && trashedProjects.has(task.projectId)),
    )
    .map((task) => task.id);
  return { taskIds, projectIds };
}
