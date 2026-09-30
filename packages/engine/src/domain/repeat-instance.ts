/**
 * Repeat Instance 派生（recurring-tasks spec / ADR-0012）：完成重复任务
 * 时派生下一个实例、重开时删除它。设备与 hub（替 web 派生）共用：
 * 同一输入得到同一个确定性 id 与同一组字段，两端并发派生经 LWW 收敛。
 */

import { ScheduledType, TaskBucket, TaskStatus, type RepeatRule } from '@taskora/shared';

import { deriveRepeatInstanceId, deriveSubtaskId, nextOccurrenceDate } from '../repeat';
import { dateKeyOf, instantMs, type CalendarZones } from './calendar';
import type { TaskFields } from './tasks';

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

export interface RepeatParentSubtask {
  title: string;
  sortOrder: unknown;
  createdAt: unknown;
}

export interface RepeatSubtaskFields {
  id: string;
  title: string;
  taskId: string;
  sortOrder: number;
  status: TaskStatus;
  settledAt: null;
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
 * 按 sortOrder 升序、平局后建的在前——两端列表同一口径）。
 *
 * 调用方负责：目标 id 已存在则跳过（另一端已派生 / 恢复后重完成）；
 * id 已被 compact 时换新 id（ADR-0008 唯一的复活路径），再用
 * subtasksFor(实际 id) 生成 Subtask。parent 取结算前的状态。
 */
export function planRepeatInstance(
  parent: RepeatParent,
  subtasks: readonly RepeatParentSubtask[],
  settledAt: string,
  zones: CalendarZones,
): {
  id: string;
  task: TaskFields;
  subtasksFor: (instanceId: string) => RepeatSubtaskFields[];
} | null {
  const target = repeatInstanceId(parent, settledAt, zones);
  if (!target) return null;
  const ordered = [...subtasks].sort(
    (a, b) =>
      ((a.sortOrder as number) ?? 0) - ((b.sortOrder as number) ?? 0) ||
      (instantMs(b.createdAt) ?? 0) - (instantMs(a.createdAt) ?? 0),
  );
  return {
    id: target.id,
    task: {
      title: parent.title,
      notes: parent.notes,
      scheduledType: ScheduledType.DATE,
      scheduledDate: target.occurrence,
      reminderTime: parent.reminderTime,
      repeatRule: parent.repeatRule,
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
        sortOrder: index,
        status: TaskStatus.ACTIVE,
        settledAt: null,
      })),
  };
}
