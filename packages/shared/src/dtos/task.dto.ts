import type { TagResponseDto } from './tag.dto';
import type { SubtaskResponseDto } from './subtask.dto';
import type { RepeatRule } from './repeat-rule.dto';
import { TaskBucket, TaskStatus, ScheduledType } from '../enums/task.enum';

export type { RepeatRule, RepeatUnit, RepeatAnchor } from './repeat-rule.dto';

export interface CreateTaskDto {
  title: string;
  notes?: string;
  scheduledDate?: string; // ISO 8601（计划日期）
  scheduledType?: ScheduledType;
  dueDate?: string; // ISO 8601（通知日期，默认 null）
  bucket?: TaskBucket;
  projectId?: string;
  areaId?: string;
  tagIds?: string[];
}

export interface UpdateTaskDto {
  title?: string;
  notes?: string;
  scheduledDate?: string | null;
  scheduledType?: ScheduledType;
  /** 提醒时刻（Reminder，HH:mm，本地时区语义）：仅 ScheduledType 为 DATE 时有效；null 清除。 */
  reminderTime?: string | null;
  /**
   * 重复规则（Repeat Rule）：仅 ScheduledType 为 DATE 时有效；离开 DATE
   * 时数据层自动清除（null）。写入时归一化为规范形（派生 id 依赖稳定输入）。
   */
  repeatRule?: RepeatRule | null;
  dueDate?: string | null;
  bucket?: TaskBucket;
  projectId?: string | null;
  areaId?: string | null;
  tagIds?: string[];
}

export interface TaskResponseDto {
  id: string;
  title: string;
  notes: string | null;
  scheduledDate: string | null; // 计划日期（原 dueDate）
  scheduledType: ScheduledType;
  /** 提醒时刻（Reminder，HH:mm）：依附于计划日期，到点由客户端本地触发系统通知；null 表示未设置。 */
  reminderTime: string | null;
  /** 重复规则（Repeat Rule）：完成后按规则派生下一实例；已了结任务保留该字段作 Logbook 溯源；null 表示未设置。 */
  repeatRule: RepeatRule | null;
  dueDate: string | null; // 通知日期（新增）
  bucket: TaskBucket;
  status: TaskStatus;
  /** 了结时间（Settled At，ADR 0006）：status 为 COMPLETED/CANCELLED 时的了结时刻；字段名保留 completedAt 以兼容前端。 */
  completedAt: string | null;
  trashedAt: string | null;
  sortOrder: number;
  projectId: string | null;
  headingId: string | null;
  areaId: string | null;
  tags?: TagResponseDto[];
  subtasks?: SubtaskResponseDto[];
  createdAt: string;
  updatedAt: string;
}
