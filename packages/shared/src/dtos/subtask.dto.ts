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
  completedAt: string | null;
  sortOrder: number;
  taskId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReorderSubtasksDto {
  orderedIds: string[];
}
