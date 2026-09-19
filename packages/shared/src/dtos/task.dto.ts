import type { TagResponseDto } from './tag.dto';
import type { SubtaskResponseDto } from './subtask.dto';
import { TaskBucket, TaskStatus, ScheduledType } from '../enums/task.enum';

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
