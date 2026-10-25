/**
 * 重复项目（recurring-projects spec）：完成带规则的项目时派生下一轮
 * 项目——项目连同 Headings、任务、Subtask 整份复制、全部重置为未完成，
 * 日期按项目计划日期的位移平移。设备与 REST 共用：同一输入得到同一组
 * 确定性 id 与字段，两端并发派生经 LWW 收敛（ADR-0012）。
 */

import { HeadingStatus, ProjectStatus, Start, TaskStatus, type RepeatRule } from '@taskora/shared';

import { deriveRepeatCopyId, deriveRepeatProjectId, nextOccurrenceDate } from '../repeat';
import { resolveTaskStart } from './start';
import { dateKeyOf, daysBetweenKeys, shiftDateKey, type CalendarZones } from './calendar';
import { occurrenceKeyOf } from './occurrence';
import { sortByEffectivePosition, type Positioned } from './order';
import { planProjectComplete, type ProjectFields, type ProjectPatch } from './projects';
import {
  copyAttachment,
  nextCopyBlock,
  planRepeatSkip,
  type RepeatNextCopySource,
  type RepeatAttachmentFields,
  type RepeatParentAttachment,
  type RepeatSkipBlock,
} from './repeat-instance';
import { planReviewSchedule, type ReviewContext } from './review';
import type { TaskFields, TaskPatch } from './tasks';

export interface RepeatProjectParent {
  id: string;
  title: string;
  notes: string | null;
  scheduledDate: unknown;
  /** 出现日（recurring-tasks-v4）：为空即等于计划日期；下一轮从它推算。 */
  occurrenceDate?: unknown;
  dueDate: unknown;
  /** 规范化后的规则（两端各自从存储解析）。 */
  repeatRule: RepeatRule | null;
  /** 来源的回顾间隔（存储原值，空值按账号默认）。 */
  reviewInterval: unknown;
  areaId: string | null;
  tagIds: readonly string[];
}

export interface RepeatProjectHeading extends Positioned {
  title: string;
}

export interface RepeatProjectTask extends Positioned {
  title: string;
  notes: string | null;
  start: unknown;
  scheduledDate: unknown;
  /** 出现日：随计划日期一起平移。 */
  occurrenceDate?: unknown;
  dueDate: unknown;
  reminderTime: string | null;
  /** 规范化后的规则。 */
  repeatRule: RepeatRule | null;
  repeatSourceId: string | null;
  trashedAt: unknown;
  headingId: string | null;
  areaId: string | null;
  tagIds: readonly string[];
}

export interface RepeatProjectSubtask extends Positioned {
  title: string;
  taskId: string;
}

export interface RepeatHeadingFields {
  id: string;
  title: string;
  position: string | null;
  status: HeadingStatus;
  completedAt: null;
  projectId: string;
}

export interface RepeatProjectSubtaskFields {
  id: string;
  title: string;
  taskId: string;
  position: string | null;
  status: TaskStatus;
  settledAt: null;
}

export interface RepeatProjectAttachment extends RepeatParentAttachment {
  taskId: string;
}

export interface RepeatProjectCopy {
  headings: RepeatHeadingFields[];
  tasks: Array<TaskFields & { id: string; position: string | null }>;
  subtasks: RepeatProjectSubtaskFields[];
  attachments: RepeatAttachmentFields[];
}

/** 下一个项目实例的确定性 id 与出现日（无规则 / 链已终结为 null）。 */
export function repeatProjectInstanceId(
  parent: Pick<RepeatProjectParent, 'id' | 'scheduledDate' | 'occurrenceDate' | 'repeatRule'>,
  completedAt: string | null,
  zones: CalendarZones,
): { id: string; occurrence: string } | null {
  const rule = parent.repeatRule;
  if (!rule) return null;
  const occurrence = nextOccurrenceDate(rule, {
    scheduledDate: dateKeyOf(parent.scheduledDate, zones),
    occurrenceDate: dateKeyOf(parent.occurrenceDate, zones),
    settledAt: completedAt,
    timeZone: zones.timeZone,
    legacyDateTimeZone: zones.legacyDateTimeZone,
  });
  if (occurrence === null) return null; // 到达 until / 无锚：链终结
  return { id: deriveRepeatProjectId(parent.id, rule, occurrence), occurrence };
}

const shifted = (value: unknown, days: number, zones: CalendarZones): string | null => {
  const key = dateKeyOf(value, zones);
  return key === null ? null : shiftDateKey(key, days);
};

/**
 * 完成重复项目时派生的下一轮。parent 取完成前的状态；tasks / subtasks /
 * headings 为来源项目下的全部行（含 Trash 中的任务，这里自行过滤）。
 *
 * - 项目：标题 / 备注 / 标签 / 区域 / 规则 / 回顾间隔复制，计划到下一个出现日，
 *   截止日期平移 delta（下一个出现日 − 来源出现日）；出现日为空；下次回顾日为
 *   派生日加间隔。
 * - Headings：全部复制（含已归档），重置为 ACTIVE。
 * - 任务：未进 Trash 的全部复制（不论了结与否：这一轮做完或放弃不代表
 *   下一轮不做），排除项目内重复链的后代（repeatSourceId 指向同项目内
 *   任务——只复制链的源头，下一轮重新起链）。重置为 ACTIVE，日期平移，
 *   repeatSourceId 清空，分组映射到副本。
 * - Subtask：随任务复制，重置为未完成。
 * - 附件：随任务复制，指向同一 Blob（ADR-0019）。
 *
 * 子实体 id 由 copyFor(实际项目 id) 按来源 id 派生：调用方先经
 * repeatDerivationTarget 决定跳过 / 用确定性 id / 换新 id。
 */
export function planRepeatProjectInstance(
  parent: RepeatProjectParent,
  completedAt: string,
  zones: CalendarZones,
  review: ReviewContext,
): {
  id: string;
  project: ProjectFields;
  copyFor: (instanceId: string, children: ProjectContentsSource) => RepeatProjectCopy;
} | null {
  const target = repeatProjectInstanceId(parent, completedAt, zones);
  if (!target) return null;
  const sourceKey = occurrenceKeyOf(parent, zones);
  const delta = sourceKey === null ? 0 : daysBetweenKeys(sourceKey, target.occurrence);

  return {
    id: target.id,
    project: {
      title: parent.title,
      notes: parent.notes,
      start: Start.ANYTIME,
      scheduledDate: target.occurrence,
      dueDate: shifted(parent.dueDate, delta, zones),
      repeatRule: parent.repeatRule,
      repeatSourceId: parent.id,
      occurrenceDate: null,
      // 沿用来源的回顾间隔，排期从派生日（今天）重新计，从未回顾
      ...planReviewSchedule(review, 'project', { reviewInterval: parent.reviewInterval }),
      status: ProjectStatus.ACTIVE,
      completedAt: null,
      trashedAt: null,
      areaId: parent.areaId,
      tagIds: [...parent.tagIds],
    },
    copyFor: (instanceId, children) => copyProjectContents(instanceId, children, delta, zones),
  };
}

/** 项目内容副本的来源：来源项目下的全部行（含 Trash 中的任务，这里自行过滤）。 */
export interface ProjectContentsSource {
  headings: ReadonlyArray<RepeatProjectHeading & { id: string }>;
  tasks: ReadonlyArray<RepeatProjectTask & { id: string }>;
  subtasks: ReadonlyArray<RepeatProjectSubtask & { id: string }>;
  attachments?: ReadonlyArray<RepeatProjectAttachment & { id: string }>;
}

/**
 * 把来源项目的 Headings / 任务 / Subtask / 附件整份复制到 instanceId 名下
 * （重复项目的下一轮与复制项目共用）：全部重置为未完成，任务日期平移
 * delta 天，排除项目内重复链的后代；子实体 id 按 (instanceId, 来源 id)
 * 派生。
 */
export function copyProjectContents(
  instanceId: string,
  children: ProjectContentsSource,
  delta: number,
  zones: CalendarZones,
): RepeatProjectCopy {
  const headings = sortByEffectivePosition(children.headings).map((heading) => ({
    id: deriveRepeatCopyId(instanceId, 'project-heading', heading.id),
    title: heading.title,
    position: heading.position ?? null,
    status: HeadingStatus.ACTIVE,
    completedAt: null,
    projectId: instanceId,
  }));
  const headingIds = new Map(
    children.headings.map((heading) => [
      heading.id,
      deriveRepeatCopyId(instanceId, 'project-heading', heading.id),
    ]),
  );

  const live = children.tasks.filter((task) => task.trashedAt == null);
  const inProject = new Set(children.tasks.map((task) => task.id));
  const templates = sortByEffectivePosition(
    live.filter((task) => !(task.repeatSourceId && inProject.has(task.repeatSourceId))),
  );
  const taskIds = new Map(
    templates.map((task) => [task.id, deriveRepeatCopyId(instanceId, 'task', task.id)]),
  );
  const tasks = templates.map((task) => {
    const scheduledDate =
      task.start === Start.SOMEDAY ? null : shifted(task.scheduledDate, delta, zones);
    const dated = scheduledDate != null;
    return {
      id: taskIds.get(task.id)!,
      position: task.position ?? null,
      title: task.title,
      notes: task.notes,
      start: resolveTaskStart(task.start, scheduledDate, instanceId, task.areaId),
      scheduledDate,
      reminderTime: dated ? task.reminderTime : null,
      repeatRule: dated ? task.repeatRule : null,
      repeatSourceId: null,
      occurrenceDate: dated ? shifted(task.occurrenceDate, delta, zones) : null,
      dueDate: shifted(task.dueDate, delta, zones),
      status: TaskStatus.ACTIVE,
      settledAt: null,
      trashedAt: null,
      projectId: instanceId,
      headingId: task.headingId ? (headingIds.get(task.headingId) ?? null) : null,
      areaId: task.areaId,
      tagIds: [...task.tagIds],
    };
  });

  const subtasks = sortByEffectivePosition(
    children.subtasks.filter((subtask) => taskIds.has(subtask.taskId)),
  ).map((subtask) => ({
    id: deriveRepeatCopyId(instanceId, 'subtask', subtask.id),
    title: subtask.title,
    taskId: taskIds.get(subtask.taskId)!,
    position: subtask.position ?? null,
    status: TaskStatus.ACTIVE,
    settledAt: null,
  }));

  const attachments = sortByEffectivePosition(
    (children.attachments ?? []).filter((attachment) => taskIds.has(attachment.taskId)),
  ).map((attachment) =>
    copyAttachment(
      attachment,
      deriveRepeatCopyId(instanceId, 'attachment', attachment.id),
      taskIds.get(attachment.taskId)!,
    ),
  );

  return { headings, tasks, subtasks, attachments };
}

// ---------- 提前生成下一份 ----------

/**
 * 项目提前生成下一份的阻断原因（规则同 nextCopyBlock；项目没有取消态，
 * 未完成即 ACTIVE）。下一份即完成时会派生的下一轮，内容取当前这一轮。
 */
export function projectNextCopyBlock(
  project: RepeatNextCopySource,
  hasLinkedInstance: boolean,
  now: string,
  zones: CalendarZones,
): RepeatSkipBlock | null {
  return nextCopyBlock(
    {
      ...project,
      status: project.status === ProjectStatus.ACTIVE ? TaskStatus.ACTIVE : project.status,
    },
    hasLinkedInstance,
    now,
    zones,
  );
}

// ---------- 跳过本次 ----------

export interface RepeatProjectSkipSource {
  status: unknown;
  trashedAt: unknown;
  scheduledDate: unknown;
  /** 出现日（recurring-tasks-v4）：为空即等于计划日期。 */
  occurrenceDate?: unknown;
  dueDate: unknown;
  /** 规范化后的规则。 */
  repeatRule: RepeatRule | null;
}

export interface RepeatProjectSkipTask {
  id: string;
  status: unknown;
  trashedAt: unknown;
  scheduledDate: unknown;
  /** 出现日：随计划日期一起平移。 */
  occurrenceDate?: unknown;
  dueDate: unknown;
}

/**
 * 项目跳过本次：项目计划日期按 planRepeatSkip 同一规则推进、截止日期
 * 平移；项目内未了结、未进 Trash 的任务，计划日期、出现日与截止日期按
 * 同一天数（下一个出现日 − 项目出现日）平移。已了结的任务不动（不复活这一轮的记录）。不新建实体。
 * 项目没有取消态：未完成即 ACTIVE。已是最后一次时完成项目，未了结、
 * 未进 Trash 的任务一并取消；调用方不派生，链就此结束。
 */
export function planProjectRepeatSkip(
  project: RepeatProjectSkipSource,
  tasks: readonly RepeatProjectSkipTask[],
  hasLinkedInstance: boolean,
  now: string,
  zones: CalendarZones,
):
  | { project: ProjectPatch; tasks: Array<{ id: string; patch: TaskPatch }> }
  | { blocked: RepeatSkipBlock } {
  const plan = planRepeatSkip(
    {
      ...project,
      status: project.status === ProjectStatus.ACTIVE ? TaskStatus.ACTIVE : project.status,
    },
    hasLinkedInstance,
    now,
    zones,
  );
  if ('blocked' in plan) return plan;
  // 最后一次：项目没有取消态，改为完成项目、剩余任务取消（不派生，链结束）
  if (plan.ends) {
    const { project: projectPatch, tasks: taskPatches } = planProjectComplete(
      project.status,
      now,
      tasks,
      'cancelled',
    )!;
    return { project: projectPatch, tasks: taskPatches };
  }
  const from = occurrenceKeyOf(project, zones)!;
  const delta = daysBetweenKeys(from, plan.patch.scheduledDate!);
  const taskPatches = tasks
    .filter((task) => task.status === TaskStatus.ACTIVE && task.trashedAt == null)
    .flatMap((task) => {
      const patch: TaskPatch = {};
      const scheduledDate = shifted(task.scheduledDate, delta, zones);
      if (scheduledDate !== null) patch.scheduledDate = scheduledDate;
      const occurrenceDate = shifted(task.occurrenceDate, delta, zones);
      if (occurrenceDate !== null) patch.occurrenceDate = occurrenceDate;
      const dueDate = shifted(task.dueDate, delta, zones);
      if (dueDate !== null) patch.dueDate = dueDate;
      return Object.keys(patch).length > 0 ? [{ id: task.id, patch }] : [];
    });
  const projectPatch: ProjectPatch = { scheduledDate: plan.patch.scheduledDate };
  if (plan.patch.occurrenceDate !== undefined) projectPatch.occurrenceDate = null;
  if (plan.patch.dueDate !== undefined) projectPatch.dueDate = plan.patch.dueDate;
  return { project: projectPatch, tasks: taskPatches };
}
