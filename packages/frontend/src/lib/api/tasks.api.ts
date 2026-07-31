import type {
  CreateTaskDto,
  ProjectResponseDto,
  TaskResponseDto,
  UpdateTaskDto,
} from '@taskora/shared';

import { apiClient } from './client';

export type TaskView = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'trash' | 'logbook';

export interface TaskQuery {
  q?: string;
  view?: TaskView;
  projectId?: string;
  areaId?: string;
  parentId?: string | null;
  tagId?: string;
  completed?: boolean;
}

export function getTasks(params?: TaskQuery): Promise<TaskResponseDto[]> {
  return apiClient
    .get<TaskResponseDto[]>('/tasks', { params })
    .then((res) => res.data);
}

export function getTask(id: string): Promise<TaskResponseDto> {
  return apiClient.get<TaskResponseDto>(`/tasks/${id}`).then((res) => res.data);
}

export function createTask(data: CreateTaskDto): Promise<TaskResponseDto> {
  return apiClient.post<TaskResponseDto>('/tasks', data).then((res) => res.data);
}

export function updateTask(id: string, data: UpdateTaskDto): Promise<TaskResponseDto> {
  return apiClient.patch<TaskResponseDto>(`/tasks/${id}`, data).then((res) => res.data);
}

export function deleteTask(id: string): Promise<void> {
  return apiClient.delete(`/tasks/${id}`).then(() => undefined);
}

export function restoreTask(id: string): Promise<TaskResponseDto> {
  return apiClient
    .post<TaskResponseDto>(`/tasks/${id}/restore`)
    .then((res) => res.data);
}

export function completeTask(id: string): Promise<TaskResponseDto> {
  return apiClient
    .post<TaskResponseDto>(`/tasks/${id}/complete`)
    .then((res) => res.data);
}

export function uncompleteTask(id: string): Promise<TaskResponseDto> {
  return apiClient
    .post<TaskResponseDto>(`/tasks/${id}/uncomplete`)
    .then((res) => res.data);
}

export function reorderTasks(orderedIds: string[]): Promise<void> {
  return apiClient.post('/tasks/reorder', { orderedIds }).then(() => undefined);
}

export function convertTaskToProject(id: string): Promise<ProjectResponseDto> {
  return apiClient
    .post<ProjectResponseDto>(`/tasks/${id}/convert-to-project`)
    .then((res) => res.data);
}