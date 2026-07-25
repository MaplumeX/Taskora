import type { TagResponseDto } from './tag.dto';
import { TaskBucket, TaskStatus } from '../enums/task.enum';

export interface CreateTaskDto {
  title: string;
  notes?: string;
  scheduledDate?: string; // ISO 8601（计划日期）
  dueDate?: string; // ISO 8601（通知日期，默认 null）
  bucket?: TaskBucket;
  parentId?: string;
  projectId?: string;
  areaId?: string;
}

export interface UpdateTaskDto {
  title?: string;
  notes?: string;
  scheduledDate?: string | null;
  dueDate?: string | null;
  bucket?: TaskBucket;
  parentId?: string | null;
  projectId?: string | null;
  areaId?: string | null;
  tagIds?: string[];
}

export interface TaskResponseDto {
  id: string;
  title: string;
  notes: string | null;
  scheduledDate: string | null; // 计划日期（原 dueDate）
  dueDate: string | null; // 通知日期（新增）
  bucket: TaskBucket;
  status: TaskStatus;
  completedAt: string | null;
  trashedAt: string | null;
  sortOrder: number;
  parentId: string | null;
  projectId: string | null;
  areaId: string | null;
  tags?: TagResponseDto[];
  children?: TaskResponseDto[];
  createdAt: string;
  updatedAt: string;
}
