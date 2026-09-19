import type { TaskStatus } from '../enums/task.enum';

export interface CreateSubtaskDto {
  title: string;
}

export interface UpdateSubtaskDto {
  title?: string;
  status?: TaskStatus;
}

export interface SubtaskResponseDto {
  id: string;
  title: string;
  status: TaskStatus;
  /** 了结时间（Settled At，ADR 0006）：status 为 COMPLETED/CANCELLED 时的了结时刻；字段名保留 completedAt 以兼容前端。 */
  completedAt: string | null;
  sortOrder: number;
  taskId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReorderSubtasksDto {
  orderedIds: string[];
}
