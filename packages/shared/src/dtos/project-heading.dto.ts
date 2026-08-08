import { HeadingStatus } from '../enums/heading.enum';

export interface CreateProjectHeadingDto {
  projectId: string;
  title: string;
}

export interface UpdateProjectHeadingDto {
  title?: string;
}

export interface ProjectHeadingResponseDto {
  id: string;
  projectId: string;
  title: string;
  sortOrder: number;
  status: HeadingStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectHeadingLayoutGroupDto {
  headingId: string;
  taskIds: string[];
}

export interface ReorderProjectHeadingLayoutDto {
  projectId: string;
  ungroupedTaskIds: string[];
  groups: ProjectHeadingLayoutGroupDto[];
}
