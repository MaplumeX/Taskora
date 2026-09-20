/**
 * Project Heading 传输层注入点 — local-first 迁移（ADR-0007 / V2 spec）。
 * 注入模式沿用 TaskBackend 已验证的先例（interface + REST 默认 + setter）。
 */

import type {
  CreateProjectHeadingDto,
  ProjectHeadingResponseDto,
  ProjectResponseDto,
  ReorderProjectHeadingLayoutDto,
  UpdateProjectHeadingDto,
} from '@taskora/shared';

import * as rest from './project-headings.api.rest';

export interface ProjectHeadingBackend {
  getProjectHeadings(
    projectId: string,
    options?: { includeArchived?: boolean },
  ): Promise<ProjectHeadingResponseDto[]>;
  createProjectHeading(data: CreateProjectHeadingDto): Promise<ProjectHeadingResponseDto>;
  updateProjectHeading(
    id: string,
    data: UpdateProjectHeadingDto,
  ): Promise<ProjectHeadingResponseDto>;
  deleteProjectHeading(id: string): Promise<void>;
  convertProjectHeadingToProject(id: string): Promise<ProjectResponseDto>;
  reorderProjectHeadingLayout(data: ReorderProjectHeadingLayoutDto): Promise<void>;
  archiveProjectHeading(id: string): Promise<ProjectHeadingResponseDto>;
  unarchiveProjectHeading(id: string): Promise<ProjectHeadingResponseDto>;
}

let backend: ProjectHeadingBackend = rest as ProjectHeadingBackend;

/** 注入 Project Heading 传输层实现（如 Engine）。传 undefined 恢复 REST。 */
export function setProjectHeadingBackend(implementation: ProjectHeadingBackend | undefined): void {
  backend = implementation ?? (rest as ProjectHeadingBackend);
}

export function currentProjectHeadingBackend(): ProjectHeadingBackend {
  return backend;
}
