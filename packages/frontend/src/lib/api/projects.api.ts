import type {
  CreateProjectDto,
  ProjectResponseDto,
  UpdateProjectDto,
} from '@taskora/shared';

import { apiClient } from './client';

export function getProjects(): Promise<ProjectResponseDto[]> {
  return apiClient.get<ProjectResponseDto[]>('/projects').then((res) => res.data);
}

export function getProject(id: string): Promise<ProjectResponseDto> {
  return apiClient.get<ProjectResponseDto>(`/projects/${id}`).then((res) => res.data);
}

export function createProject(data: CreateProjectDto): Promise<ProjectResponseDto> {
  return apiClient
    .post<ProjectResponseDto>('/projects', data)
    .then((res) => res.data);
}

export function updateProject(id: string, data: UpdateProjectDto): Promise<ProjectResponseDto> {
  return apiClient
    .patch<ProjectResponseDto>(`/projects/${id}`, data)
    .then((res) => res.data);
}

export function deleteProject(id: string): Promise<void> {
  return apiClient.delete(`/projects/${id}`).then(() => undefined);
}