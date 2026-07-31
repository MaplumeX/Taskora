import type {
  CreateProjectHeadingDto,
  ProjectHeadingResponseDto,
  ReorderProjectHeadingLayoutDto,
  UpdateProjectHeadingDto,
} from '@taskora/shared';

import { apiClient } from './client';

export function getProjectHeadings(projectId: string): Promise<ProjectHeadingResponseDto[]> {
  return apiClient
    .get<ProjectHeadingResponseDto[]>('/project-headings', {
      params: { projectId },
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

export function reorderProjectHeadingLayout(data: ReorderProjectHeadingLayoutDto): Promise<void> {
  return apiClient.post('/project-headings/reorder', data).then(() => undefined);
}
