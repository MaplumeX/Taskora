/**
 * Project 传输层注入点 — local-first 迁移（ADR-0007 / V2 spec）。
 *
 * 默认实现为 REST（thin-client，web 端在过渡期维持现状）；桌面端在
 * boot 时注入 Engine 实现（`engine/project-backend.engine.ts`），所有
 * Project 的 React Query hooks 与组件树零改动地切换到本地副本读写。
 * 注入模式沿用 TaskBackend 已验证的先例。
 */

import type {
  CompleteProjectDto,
  CreateProjectDto,
  ProjectResponseDto,
  UpdateProjectDto,
} from '@taskora/shared';

import * as rest from './projects.api.rest';

export interface ProjectBackend {
  getProjects(): Promise<ProjectResponseDto[]>;
  getProject(id: string): Promise<ProjectResponseDto>;
  createProject(data: CreateProjectDto): Promise<ProjectResponseDto>;
  updateProject(id: string, data: UpdateProjectDto): Promise<ProjectResponseDto>;
  deleteProject(id: string): Promise<void>;
  restoreProject(id: string): Promise<ProjectResponseDto>;
  /**
   * 完成项目；带重复规则时派生下一轮（recurring-projects spec）。
   * settleRemaining 给出时一并了结剩余任务。
   */
  completeProject(id: string, options?: CompleteProjectDto): Promise<ProjectResponseDto>;
  /**
   * 重复项目「跳过本次」：计划日期推进到下一次，项目内未了结任务的日期
   * 同步平移。不可跳过时抛 RepeatSkipBlockedError。
   */
  skipProject(id: string): Promise<ProjectResponseDto>;
  uncompleteProject(id: string): Promise<ProjectResponseDto>;
  reorderProjects(orderedIds: string[]): Promise<void>;
}

let backend: ProjectBackend = rest as ProjectBackend;

/** 注入 Project 传输层实现（如 Engine）。传 undefined 恢复 REST。 */
export function setProjectBackend(implementation: ProjectBackend | undefined): void {
  backend = implementation ?? (rest as ProjectBackend);
}

export function currentProjectBackend(): ProjectBackend {
  return backend;
}
