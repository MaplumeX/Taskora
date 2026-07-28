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

export function restoreProject(id: string): Promise<ProjectResponseDto> {
  return apiClient
    .post<ProjectResponseDto>(`/projects/${id}/restore`)
    .then((res) => res.data);
}

export function completeProject(id: string): Promise<ProjectResponseDto> {
  return apiClient
    .post<ProjectResponseDto>(`/projects/${id}/complete`)
    .then((res) => res.data);
}

export function uncompleteProject(id: string): Promise<ProjectResponseDto> {
  return apiClient
    .post<ProjectResponseDto>(`/projects/${id}/uncomplete`)
    .then((res) => res.data);
}

export function reorderProjects(orderedIds: string[]): Promise<void> {
  return apiClient.post('/projects/reorder', { orderedIds }).then(() => undefined);
}