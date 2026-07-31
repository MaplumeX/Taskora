import type {
  CreateSubtaskDto,
  CreateTaskDto,
  ProjectResponseDto,
  ReorderSubtasksDto,
  SubtaskResponseDto,
  TaskResponseDto,
  UpdateSubtaskDto,
  UpdateTaskDto,
} from '@taskora/shared';

import { apiClient } from './client';

export type TaskView = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'trash' | 'logbook';

export interface TaskQuery {
  q?: string;
  view?: TaskView;
  projectId?: string;
  areaId?: string;
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

export function createSubtask(
  taskId: string,
  data: CreateSubtaskDto,
): Promise<SubtaskResponseDto> {
  return apiClient
    .post<SubtaskResponseDto>(`/tasks/${taskId}/subtasks`, data)
    .then((res) => res.data);
}

export function updateSubtask(
  id: string,
  data: UpdateSubtaskDto,
): Promise<SubtaskResponseDto> {
  return apiClient
    .patch<SubtaskResponseDto>(`/subtasks/${id}`, data)
    .then((res) => res.data);
}

export function deleteSubtask(id: string): Promise<void> {
  return apiClient.delete(`/subtasks/${id}`).then(() => undefined);
}

export function completeSubtask(id: string): Promise<SubtaskResponseDto> {
  return apiClient
    .post<SubtaskResponseDto>(`/subtasks/${id}/complete`)
    .then((res) => res.data);
}

export function uncompleteSubtask(id: string): Promise<SubtaskResponseDto> {
  return apiClient
    .post<SubtaskResponseDto>(`/subtasks/${id}/uncomplete`)
    .then((res) => res.data);
}

export function reorderSubtasks(
  taskId: string,
  orderedIds: string[],
): Promise<void> {
  const body: ReorderSubtasksDto = { orderedIds };
  return apiClient
    .post(`/tasks/${taskId}/subtasks/reorder`, body)
    .then(() => undefined);
}