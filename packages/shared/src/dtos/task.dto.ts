import { TaskBucket, TaskStatus } from '../enums/task.enum';

export interface CreateTaskDto {
  title: string;
  notes?: string;
  dueDate?: string; // ISO 8601
  bucket?: TaskBucket;
  parentId?: string;
  projectId?: string;
  areaId?: string;
}

export interface UpdateTaskDto {
  title?: string;
  notes?: string;
  dueDate?: string | null;
  bucket?: TaskBucket;
  parentId?: string | null;
  projectId?: string | null;
  areaId?: string | null;
}

export interface TaskResponseDto {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  bucket: TaskBucket;
  status: TaskStatus;
  completedAt: string | null;
  trashedAt: string | null;
  sortOrder: number;
  parentId: string | null;
  projectId: string | null;
  areaId: string | null;
  children?: TaskResponseDto[];
  createdAt: string;
  updatedAt: string;
}
