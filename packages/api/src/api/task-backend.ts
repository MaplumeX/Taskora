/**
 * Task 传输层注入点 — local-first 迁移的垂直切片开关（ADR-0007）。
 *
 * 默认实现为 REST（thin-client，web 端在过渡期维持现状）；桌面端在
 * boot 时注入 Engine 实现（`task-backend.engine.ts`），所有 Task/Feed
 * 的 React Query hooks 与组件树零改动地切换到本地副本读写。
 * 未迁移切片（convert-to-project 等 hub 复合操作）在 Engine 实现中
 * 仍回落 REST，由 collector → 同步推流到达设备。
 */

import type {
  CreateSubtaskDto,
  CreateTaskDto,
  FeedView,
  SubtaskResponseDto,
  TaskResponseDto,
  UpdateSubtaskDto,
  UpdateTaskDto,
} from '@taskora/shared';
import type { TaskQuery } from './tasks.api.rest';

export type { TaskQuery };

export interface TaskBackend {
  getTasks(params?: TaskQuery): Promise<TaskResponseDto[]>;
  getTask(id: string): Promise<TaskResponseDto>;
  getFeed(view: FeedView): Promise<import('@taskora/shared').FeedItem[]>;
  createTask(data: CreateTaskDto): Promise<TaskResponseDto>;
  updateTask(id: string, data: UpdateTaskDto): Promise<TaskResponseDto>;
  deleteTask(id: string): Promise<void>;
  restoreTask(id: string): Promise<TaskResponseDto>;
  completeTask(id: string): Promise<TaskResponseDto>;
  uncompleteTask(id: string): Promise<TaskResponseDto>;
  cancelTask(id: string): Promise<TaskResponseDto>;
  uncancelTask(id: string): Promise<TaskResponseDto>;
  reorderTasks(orderedIds: string[]): Promise<void>;
  convertTaskToProject(id: string): Promise<import('@taskora/shared').ProjectResponseDto>;
  createSubtask(taskId: string, data: CreateSubtaskDto): Promise<SubtaskResponseDto>;
  updateSubtask(id: string, data: UpdateSubtaskDto): Promise<SubtaskResponseDto>;
  deleteSubtask(id: string): Promise<void>;
  completeSubtask(id: string): Promise<SubtaskResponseDto>;
  uncompleteSubtask(id: string): Promise<SubtaskResponseDto>;
  cancelSubtask(id: string): Promise<SubtaskResponseDto>;
  uncancelSubtask(id: string): Promise<SubtaskResponseDto>;
  reorderSubtasks(taskId: string, orderedIds: string[]): Promise<void>;
  /** 清空 Trash：物理删除（Engine 实现走 Delete Request，ADR-0008）。 */
  emptyTrash(): Promise<{ deletedTasks: number; deletedProjects: number }>;
}

import * as rest from './tasks.api.rest';

let backend: TaskBackend = rest as TaskBackend;

/** 注入 Task 传输层实现（如 Engine）。传 undefined 恢复 REST。 */
export function setTaskBackend(implementation: TaskBackend | undefined): void {
  backend = implementation ?? (rest as TaskBackend);
}

export function currentTaskBackend(): TaskBackend {
  return backend;
}
