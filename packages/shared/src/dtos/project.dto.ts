import type { TagResponseDto } from './tag.dto';
import { ScheduledType } from '../enums/task.enum';
import { ProjectStatus, ProjectBucket } from '../enums/project.enum';

export interface CreateProjectDto {
  title: string;
  notes?: string;
  areaId?: string;
  scheduledDate?: string; // ISO 8601
  scheduledType?: ScheduledType;
  dueDate?: string; // ISO 8601
  bucket?: ProjectBucket;
  tagIds?: string[];
}

export interface UpdateProjectDto {
  title?: string;
  notes?: string;
  areaId?: string | null;
  scheduledDate?: string | null;
  scheduledType?: ScheduledType;
  dueDate?: string | null;
  bucket?: ProjectBucket;
  tagIds?: string[];
}

export interface ProjectResponseDto {
  id: string;
  title: string;
  notes: string | null;
  areaId: string | null;
  sortOrder: number;
  status: ProjectStatus;
  bucket: ProjectBucket;
  scheduledType: ScheduledType;
  scheduledDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  trashedAt: string | null;
  tags?: TagResponseDto[];
  taskTotalCount: number;
  taskCompletedCount: number;
  createdAt: string;
  updatedAt: string;
}