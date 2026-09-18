import type { TagResponseDto } from '@taskora/shared';
import { ScheduledType } from '@taskora/shared';

/**
 * 字段编辑组件的结构化视图：Task 与 Project 的响应 DTO 均满足，
 * 使同一组字段组件可复用于两种实体。
 */
export interface ScheduledFieldCurrent {
  scheduledType?: ScheduledType | null;
  scheduledDate?: string | null;
}

export interface ScheduledFieldPatch {
  scheduledType: ScheduledType;
  scheduledDate?: string | null;
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
