/**
 * Repeat Instance 派生（recurring-tasks spec / ADR-0012）：完成重复任务
 * 时派生下一个实例。实例一经创建即独立：重开来源任务不删除它
 * （recurring-tasks-v2）。设备与 hub（替 web 派生）共用：同一输入得到
 * 同一个确定性 id 与同一组字段，两端并发派生经 LWW 收敛。
 */

import { ScheduledType, TaskBucket, TaskStatus, type RepeatRule } from '@taskora/shared';

import {
  deriveAttachmentId,
  deriveRepeatInstanceId,
  deriveSubtaskId,
  nextOccurrenceDate,
  skipOccurrenceDate,
} from '../repeat';
import { dateKeyOf, daysBetweenKeys, shiftDateKey, type CalendarZones } from './calendar';
import { sortByEffectivePosition, type Positioned } from './order';
import type { TaskFields, TaskPatch } from './tasks';

export interface RepeatParent {
  id: string;
  title: string;
  notes: string | null;
  scheduledDate: unknown;
  /** 规范化后的规则（两端各自从存储解析）。 */
  repeatRule: RepeatRule | null;
  reminderTime: string | null;
  projectId: string | null;
  headingId: string | null;
  areaId: string | null;
  tagIds: readonly string[];
}

export interface RepeatParentSubtask extends Positioned {
  title: string;
}

export interface RepeatSubtaskFields {
  id: string;
  title: string;
  taskId: string;
  position: string | null;
  status: TaskStatus;
  settledAt: null;
}

/** 被复制的附件：元数据原样复制，指向同一 Blob（ADR-0019）。 */
export interface RepeatParentAttachment extends Positioned {
  name: string;
  mimeType: string;
  size: number;
  blobHash: string;
}

export interface RepeatAttachmentFields {
  id: string;
  taskId: string;
  name: string;
  mimeType: string;
  size: number;
  blobHash: string;
  position: string | null;
}

/** 附件副本的字段：内容不变（同一 Blob），只换父任务与 id。 */
export function copyAttachment(
  attachment: RepeatParentAttachment,
  id: string,
  taskId: string,
): RepeatAttachmentFields {
  return {
    id,
    taskId,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    blobHash: attachment.blobHash,
    position: attachment.position ?? null,
  };
}

/** 下一个实例的确定性 id（无规则 / 链已终结为 null）。 */
export function repeatInstanceId(
  parent: Pick<RepeatParent, 'id' | 'scheduledDate' | 'repeatRule'>,
  settledAt: string | null,
  zones: CalendarZones,
): { id: string; occurrence: string } | null {
  const rule = parent.repeatRule;
  if (!rule) return null;
  const occurrence = nextOccurrenceDate(rule, {
    scheduledDate: dateKeyOf(parent.scheduledDate, zones),
    settledAt,
    timeZone: zones.timeZone,
    legacyDateTimeZone: zones.legacyDateTimeZone,
  });
  if (occurrence === null) return null; // 到达 until / 无锚：链终结
  return { id: deriveRepeatInstanceId(parent.id, rule, occurrence), occurrence };
}

/**
 * 完成时派生的实例：复制标题 / 备注 / 标签 / 提醒时刻 / 归属 / 规则，
 * 计划到下一个日期；Subtask 复制并重置为未完成（序号决定确定性 id，
 * 按有效 Position——两端列表同一口径；新实例沿用原 Position）；附件
 * 同样按序号复制，指向同一 Blob（ADR-0019）。
 *
 * 调用方先经 repeatDerivationTarget 决定跳过 / 用确定性 id / 换新 id，
 * 再用 subtasksFor / attachmentsFor(实际 id) 生成子实体。parent 取结算
 * 前的状态。
 */
export function planRepeatInstance(
  parent: RepeatParent,
  subtasks: readonly RepeatParentSubtask[],
  settledAt: string,
  zones: CalendarZones,
  attachments: readonly RepeatParentAttachment[] = [],
): {
  id: string;
  task: TaskFields;
  subtasksFor: (instanceId: string) => RepeatSubtaskFields[];
  attachmentsFor: (instanceId: string) => RepeatAttachmentFields[];
} | null {
  const target = repeatInstanceId(parent, settledAt, zones);
  if (!target) return null;
  const ordered = sortByEffectivePosition(subtasks);
  const orderedAttachments = sortByEffectivePosition(attachments);
  return {
    id: target.id,
    task: {
      title: parent.title,
      notes: parent.notes,
      scheduledType: ScheduledType.DATE,
      scheduledDate: target.occurrence,
      reminderTime: parent.reminderTime,
      repeatRule: parent.repeatRule,
      repeatSourceId: parent.id,
      dueDate: null,
      bucket: TaskBucket.SCHEDULED,
      status: TaskStatus.ACTIVE,
      settledAt: null,
      trashedAt: null,
      projectId: parent.projectId,
      headingId: parent.headingId,
      areaId: parent.areaId,
      tagIds: [...parent.tagIds],
    },
    subtasksFor: (instanceId) =>
      ordered.map((subtask, index) => ({
        id: deriveSubtaskId(instanceId, index),
        title: subtask.title,
        taskId: instanceId,
        position: subtask.position ?? null,
        status: TaskStatus.ACTIVE,
        settledAt: null,
      })),
    attachmentsFor: (instanceId) =>
      orderedAttachments.map((attachment, index) =>
        copyAttachment(attachment, deriveAttachmentId(instanceId, index), instanceId),
      ),
  };
}

/** 确定性 id 在存储里的现状。 */
export type PlannedIdState = 'absent' | 'live' | 'trashed' | 'compacted';

/**
 * 派生的落地决策（设备与 REST 共用，recurring-tasks-v2 issue 01）：
 *
 * - 来源已有未进 Trash 的派生实例（按 repeatSourceId）→ skip：重开后再
 *   完成、anchor=completion 换日再完成都不重复派生；
 * - 确定性 id 上已有未进 Trash 的行 → skip：另一端并发派生，或
 *   repeatSourceId 出现之前派生的存量实例；
 * - 确定性 id 的行在 Trash，或已被 compact → fresh：用户主动丢弃了上一
 *   个实例，重新派生只能换新 id（ADR-0008 唯一的复活路径）；
 * - 否则 → planned：用确定性 id（并发派生经 LWW 收敛，ADR-0012）。
 */
export function repeatDerivationTarget(input: {
  hasLinkedInstance: boolean;
  plannedId: PlannedIdState;
}): 'skip' | 'planned' | 'fresh' {
  if (input.hasLinkedInstance || input.plannedId === 'live') return 'skip';
  if (input.plannedId === 'absent') return 'planned';
  return 'fresh';
}

// ---------- 跳过本次（recurring-tasks-v2 issue 02） ----------

/**
 * 不可跳过的原因：
 * - not-repeating：无规则或非 DATE 型；
 * - not-active：已了结或在 Trash；
 * - no-next：链在下一次之前终结（until）；
 * - next-exists：该任务已有未进 Trash 的派生实例（撤销完成后留下的），
 *   跳过会在同一天叠出两条。
 */
export type RepeatSkipBlock = 'not-repeating' | 'not-active' | 'no-next' | 'next-exists';

export class RepeatSkipBlockedError extends Error {
  readonly name = 'RepeatSkipBlockedError';

  constructor(readonly reason: RepeatSkipBlock) {
    super(`Cannot skip occurrence: ${reason}`);
  }
}

export interface RepeatSkipSource {
  status: unknown;
  trashedAt: unknown;
  scheduledType: unknown;
  scheduledDate: unknown;
  dueDate: unknown;
  /** 规范化后的规则。 */
  repeatRule: RepeatRule | null;
}

/**
 * 跳过本次：计划日期原地推进到下一个出现日（目标见 skipOccurrenceDate），
 * 已有截止日期按相同天数平移；不新建实体、不进 Logbook。调用方另把
 * 该任务的全部 Subtask 置回 ACTIVE（subtaskStatusPatch）。
 */
export function planRepeatSkip(
  task: RepeatSkipSource,
  hasLinkedInstance: boolean,
  now: string,
  zones: CalendarZones,
): { patch: TaskPatch } | { blocked: RepeatSkipBlock } {
  const rule = task.repeatRule;
  const scheduledKey = dateKeyOf(task.scheduledDate, zones);
  if (!rule || task.scheduledType !== ScheduledType.DATE || scheduledKey === null) {
    return { blocked: 'not-repeating' };
  }
  if (task.status !== TaskStatus.ACTIVE || task.trashedAt) return { blocked: 'not-active' };
  if (hasLinkedInstance) return { blocked: 'next-exists' };
  const occurrence = skipOccurrenceDate(rule, {
    scheduledDate: scheduledKey,
    now,
    timeZone: zones.timeZone,
    legacyDateTimeZone: zones.legacyDateTimeZone,
  });
  if (occurrence === null) return { blocked: 'no-next' };
  const patch: TaskPatch = { scheduledDate: occurrence };
  const dueKey = dateKeyOf(task.dueDate, zones);
  if (dueKey !== null) {
    patch.dueDate = shiftDateKey(dueKey, daysBetweenKeys(scheduledKey, occurrence));
  }
  return { patch };
}
