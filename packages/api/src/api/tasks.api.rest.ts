import type {
  AttachmentResponseDto,
  CreateAttachmentDto,
  CreateSubtaskDto,
  CreateTaskDto,
  FeedItem,
  FeedOrderItem,
  FeedView,
  ProjectResponseDto,
  ReorderAttachmentsDto,
  ReorderSubtasksDto,
  SubtaskResponseDto,
  TaskResponseDto,
  TaskSearchHit,
  UpdateAttachmentDto,
  UpdateSubtaskDto,
  UpdateTaskDto,
} from '@taskora/shared';

import axios from 'axios';
import { RepeatSkipBlockedError, type RepeatSkipBlock } from '@taskora/engine';

import { apiClient } from './client';

export type TaskView = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'trash' | 'logbook';

export interface TaskQuery {
  q?: string;
  view?: TaskView;
  projectId?: string;
  areaId?: string;
  tagId?: string;
  completed?: boolean;
  hasScheduled?: boolean;
}

export function getTasks(params?: TaskQuery): Promise<TaskResponseDto[]> {
  return apiClient.get<TaskResponseDto[]>('/tasks', { params }).then((res) => res.data);
}

export interface TaskSearchOptions {
  /** 继续搜索：纳入已了结（Logbook）与 Trash 中的任务。 */
  extended?: boolean;
  /** Tag 条件（Quick Find `#tag`）：各 Tag 之间 AND，按有效 Tag 的子树命中。 */
  tagIds?: readonly string[];
}

export function searchTasks(q: string, options?: TaskSearchOptions): Promise<TaskSearchHit[]> {
  return apiClient
    .get<TaskSearchHit[]>('/tasks/search', {
      params: {
        q,
        extended: options?.extended || undefined,
        // 逗号分隔（Tag id 是 uuid，不含逗号）
        tagIds: options?.tagIds?.length ? options.tagIds.join(',') : undefined,
      },
    })
    .then((res) => res.data);
}

export function getTask(id: string): Promise<TaskResponseDto> {
  return apiClient.get<TaskResponseDto>(`/tasks/${id}`).then((res) => res.data);
}

export function getFeed(view: FeedView): Promise<FeedItem[]> {
  return apiClient.get<FeedItem[]>('/feed', { params: { view } }).then((res) => res.data);
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
  return apiClient.post<TaskResponseDto>(`/tasks/${id}/restore`).then((res) => res.data);
}

export function completeTask(id: string): Promise<TaskResponseDto> {
  return apiClient.post<TaskResponseDto>(`/tasks/${id}/complete`).then((res) => res.data);
}

export function uncompleteTask(id: string): Promise<TaskResponseDto> {
  return apiClient.post<TaskResponseDto>(`/tasks/${id}/uncomplete`).then((res) => res.data);
}

export function cancelTask(id: string): Promise<TaskResponseDto> {
  return apiClient.post<TaskResponseDto>(`/tasks/${id}/cancel`).then((res) => res.data);
}

export function uncancelTask(id: string): Promise<TaskResponseDto> {
  return apiClient.post<TaskResponseDto>(`/tasks/${id}/uncancel`).then((res) => res.data);
}

export function skipTask(id: string): Promise<TaskResponseDto> {
  return apiClient
    .post<TaskResponseDto>(`/tasks/${id}/skip`)
    .then((res) => res.data)
    .catch((error: unknown) => {
      // 409 的 message 即不可跳过的原因（与 Engine 实现抛同一种错误）
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        throw new RepeatSkipBlockedError(error.response.data?.message as RepeatSkipBlock);
      }
      throw error;
    });
}

export function duplicateTask(id: string): Promise<TaskResponseDto> {
  return apiClient.post<TaskResponseDto>(`/tasks/${id}/duplicate`).then((res) => res.data);
}

export function reorderTasks(orderedIds: string[]): Promise<void> {
  return apiClient.post('/tasks/reorder', { orderedIds }).then(() => undefined);
}

export function reorderFeed(items: FeedOrderItem[]): Promise<void> {
  return apiClient.post('/feed/reorder', { items }).then(() => undefined);
}

export function convertTaskToProject(id: string): Promise<ProjectResponseDto> {
  return apiClient
    .post<ProjectResponseDto>(`/tasks/${id}/convert-to-project`)
    .then((res) => res.data);
}

export function createSubtask(taskId: string, data: CreateSubtaskDto): Promise<SubtaskResponseDto> {
  return apiClient
    .post<SubtaskResponseDto>(`/tasks/${taskId}/subtasks`, data)
    .then((res) => res.data);
}

export function updateSubtask(id: string, data: UpdateSubtaskDto): Promise<SubtaskResponseDto> {
  return apiClient.patch<SubtaskResponseDto>(`/subtasks/${id}`, data).then((res) => res.data);
}

export function deleteSubtask(id: string): Promise<void> {
  return apiClient.delete(`/subtasks/${id}`).then(() => undefined);
}

export function completeSubtask(id: string): Promise<SubtaskResponseDto> {
  return apiClient.post<SubtaskResponseDto>(`/subtasks/${id}/complete`).then((res) => res.data);
}

export function uncompleteSubtask(id: string): Promise<SubtaskResponseDto> {
  return apiClient.post<SubtaskResponseDto>(`/subtasks/${id}/uncomplete`).then((res) => res.data);
}

export function cancelSubtask(id: string): Promise<SubtaskResponseDto> {
  return apiClient.post<SubtaskResponseDto>(`/subtasks/${id}/cancel`).then((res) => res.data);
}

export function uncancelSubtask(id: string): Promise<SubtaskResponseDto> {
  return apiClient.post<SubtaskResponseDto>(`/subtasks/${id}/uncancel`).then((res) => res.data);
}

export function reorderSubtasks(taskId: string, orderedIds: string[]): Promise<void> {
  const body: ReorderSubtasksDto = { orderedIds };
  return apiClient.post(`/tasks/${taskId}/subtasks/reorder`, body).then(() => undefined);
}

export function createAttachment(
  taskId: string,
  data: CreateAttachmentDto,
): Promise<AttachmentResponseDto> {
  return apiClient
    .post<AttachmentResponseDto>(`/tasks/${taskId}/attachments`, data)
    .then((res) => res.data);
}

export function updateAttachment(
  id: string,
  data: UpdateAttachmentDto,
): Promise<AttachmentResponseDto> {
  return apiClient.patch<AttachmentResponseDto>(`/attachments/${id}`, data).then((res) => res.data);
}

export function deleteAttachment(id: string): Promise<void> {
  return apiClient.delete(`/attachments/${id}`).then(() => undefined);
}

export function reorderAttachments(taskId: string, orderedIds: string[]): Promise<void> {
  const body: ReorderAttachmentsDto = { orderedIds };
  return apiClient.post(`/tasks/${taskId}/attachments/reorder`, body).then(() => undefined);
}

export function emptyTrash(): Promise<{ deletedTasks: number; deletedProjects: number }> {
  return apiClient
    .post<{ deletedTasks: number; deletedProjects: number }>('/feed/trash/empty')
    .then((res) => res.data);
}
