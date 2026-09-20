import type { CreateProjectDto, ProjectResponseDto, UpdateProjectDto } from '@taskora/shared';

import { currentProjectBackend } from './project-backend';

/**
 * Project API 门面 — 数据源随 TaskBackend 同一注入模式切换（V2 spec）：
 * 默认 REST（web），桌面端登录装配时切到 Local Replica。
 */
export function getProjects(): Promise<ProjectResponseDto[]> {
  return currentProjectBackend().getProjects();
}

export function getProject(id: string): Promise<ProjectResponseDto> {
  return currentProjectBackend().getProject(id);
}

export function createProject(data: CreateProjectDto): Promise<ProjectResponseDto> {
  return currentProjectBackend().createProject(data);
}

export function updateProject(id: string, data: UpdateProjectDto): Promise<ProjectResponseDto> {
  return currentProjectBackend().updateProject(id, data);
}

export function deleteProject(id: string): Promise<void> {
  return currentProjectBackend().deleteProject(id);
}

export function restoreProject(id: string): Promise<ProjectResponseDto> {
  return currentProjectBackend().restoreProject(id);
}

export function completeProject(id: string): Promise<ProjectResponseDto> {
  return currentProjectBackend().completeProject(id);
}

export function uncompleteProject(id: string): Promise<ProjectResponseDto> {
  return currentProjectBackend().uncompleteProject(id);
}

export function reorderProjects(orderedIds: string[]): Promise<void> {
  return currentProjectBackend().reorderProjects(orderedIds);
}
