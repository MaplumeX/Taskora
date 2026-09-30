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
  /**
   * 完成任务。`settledAt` 仅供延迟应用的操作（通知上的「完成」）指定点击
   * 时刻为了结时间；缺省为当前时刻。REST 实现忽略它（由服务端取时间）。
   */
  completeTask(id: string, options?: { settledAt?: string }): Promise<TaskResponseDto>;
  uncompleteTask(id: string): Promise<TaskResponseDto>;
  cancelTask(id: string): Promise<TaskResponseDto>;
  uncancelTask(id: string): Promise<TaskResponseDto>;
  /**
   * 跳过本次（recurring-tasks-v2）：计划日期原地推进到链的下一个出现日。
   * 不可跳过时抛 RepeatSkipBlockedError（reason 说明原因）。
   */
  skipTask(id: string): Promise<TaskResponseDto>;
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

// 结构化赋值（非 as 强转）：rest 模块一旦缺失 TaskBackend 的任何成员，
// 这里会直接编译报错，避免运行时 undefined 方法（线上「加载失败」缺陷的成因）。
const restBackend: TaskBackend = rest;

let backend: TaskBackend = restBackend;

/** 注入 Task 传输层实现（如 Engine）。传 undefined 恢复 REST。 */
export function setTaskBackend(implementation: TaskBackend | undefined): void {
  backend = implementation ?? restBackend;
}

export function currentTaskBackend(): TaskBackend {
  return backend;
}

/**
 * 当前是否为 Engine（local-first）模式：各域后端总是一起注入（桌面端 /
 * 移动端装配 Engine 时），以 Task 后端为准。Engine 模式下缓存由 Engine 的
 * 变更通知驱动刷新，mutation 不再自行失效（local-first-v3 issue 02）。
 */
export function isEngineMode(): boolean {
  return backend !== restBackend;
}
