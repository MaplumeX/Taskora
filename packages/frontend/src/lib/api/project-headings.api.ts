import type {
  CreateProjectHeadingDto,
  ProjectHeadingResponseDto,
  ProjectResponseDto,
  ReorderProjectHeadingLayoutDto,
  UpdateProjectHeadingDto,
} from '@taskora/shared';

import { apiClient } from './client';

export function getProjectHeadings(
  projectId: string,
  options?: { includeArchived?: boolean },
): Promise<ProjectHeadingResponseDto[]> {
  return apiClient
    .get<ProjectHeadingResponseDto[]>('/project-headings', {
      params: { projectId, includeArchived: options?.includeArchived },
    })
    .then((response) => response.data);
}

export function createProjectHeading(
  data: CreateProjectHeadingDto,
): Promise<ProjectHeadingResponseDto> {
  return apiClient
    .post<ProjectHeadingResponseDto>('/project-headings', data)
    .then((response) => response.data);
}

export function updateProjectHeading(
  id: string,
  data: UpdateProjectHeadingDto,
): Promise<ProjectHeadingResponseDto> {
  return apiClient
    .patch<ProjectHeadingResponseDto>(`/project-headings/${id}`, data)
    .then((response) => response.data);
}

export function deleteProjectHeading(id: string): Promise<void> {
  return apiClient.delete(`/project-headings/${id}`).then(() => undefined);
}

export function convertProjectHeadingToProject(id: string): Promise<ProjectResponseDto> {
  return apiClient
    .post<ProjectResponseDto>(`/project-headings/${id}/convert-to-project`)
    .then((response) => response.data);
}

export function reorderProjectHeadingLayout(data: ReorderProjectHeadingLayoutDto): Promise<void> {
  return apiClient.post('/project-headings/reorder', data).then(() => undefined);
}

export function archiveProjectHeading(id: string): Promise<ProjectHeadingResponseDto> {
  return apiClient
    .post<ProjectHeadingResponseDto>(`/project-headings/${id}/archive`)
    .then((response) => response.data);
}

export function unarchiveProjectHeading(id: string): Promise<ProjectHeadingResponseDto> {
  return apiClient
    .post<ProjectHeadingResponseDto>(`/project-headings/${id}/unarchive`)
    .then((response) => response.data);
}
