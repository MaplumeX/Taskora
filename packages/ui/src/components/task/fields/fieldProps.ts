import type { RepeatRule, Start, TagResponseDto } from '@taskora/shared';

/**
 * 字段编辑组件的结构化视图：Task 与 Project 的响应 DTO 均满足，
 * 使同一组字段组件可复用于两种实体。
 */
export interface ScheduledFieldCurrent {
  /** 开始状态（ADR 0024）：SOMEDAY 时没有计划日期。 */
  start?: Start | null;
  scheduledDate?: string | null;
  /** Reminder（HH:mm）：仅 Task 提供（Project 不设 Reminder）。 */
  reminderTime?: string | null;
  /** Repeat Rule：Task 与 Project 皆可设（仅有计划日期时）。 */
  repeatRule?: RepeatRule | null;
}

export interface ScheduledFieldPatch {
  start?: Start;
  scheduledDate?: string | null;
  /** 开关开启（缺省 09:00）或改时刻时携带；null 表示关闭提醒。 */
  reminderTime?: string | null;
  /** 重复规则：开启/编辑时携带完整规则；null 表示关闭（清除规则）。 */
  repeatRule?: RepeatRule | null;
}

export interface DueDateFieldCurrent {
  dueDate?: string | null;
}

export interface DueDateFieldPatch {
  dueDate?: string | null;
}

export interface TagsFieldCurrent {
  tags?: TagResponseDto[] | null;
}

export interface TagsFieldPatch {
  tagIds: string[];
}
