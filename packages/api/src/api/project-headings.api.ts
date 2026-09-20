import type {
  CreateProjectHeadingDto,
  ProjectHeadingResponseDto,
  ProjectResponseDto,
  ReorderProjectHeadingLayoutDto,
  UpdateProjectHeadingDto,
} from '@taskora/shared';

import { currentProjectHeadingBackend } from './project-heading-backend';

/**
 * Project Heading API 门面 — 数据源随 TaskBackend 同一注入模式切换
 * （V2 spec）：默认 REST（web），桌面端登录装配时切到 Local Replica。
 */
export function getProjectHeadings(
  projectId: string,
  options?: { includeArchived?: boolean },
): Promise<ProjectHeadingResponseDto[]> {
  return currentProjectHeadingBackend().getProjectHeadings(projectId, options);
}

export function createProjectHeading(
  data: CreateProjectHeadingDto,
): Promise<ProjectHeadingResponseDto> {
  return currentProjectHeadingBackend().createProjectHeading(data);
}

export function updateProjectHeading(
  id: string,
  data: UpdateProjectHeadingDto,
): Promise<ProjectHeadingResponseDto> {
  return currentProjectHeadingBackend().updateProjectHeading(id, data);
}

export function deleteProjectHeading(id: string): Promise<void> {
  return currentProjectHeadingBackend().deleteProjectHeading(id);
}

export function convertProjectHeadingToProject(id: string): Promise<ProjectResponseDto> {
  return currentProjectHeadingBackend().convertProjectHeadingToProject(id);
}

export function reorderProjectHeadingLayout(data: ReorderProjectHeadingLayoutDto): Promise<void> {
  return currentProjectHeadingBackend().reorderProjectHeadingLayout(data);
}

export function archiveProjectHeading(id: string): Promise<ProjectHeadingResponseDto> {
  return currentProjectHeadingBackend().archiveProjectHeading(id);
}

export function unarchiveProjectHeading(id: string): Promise<ProjectHeadingResponseDto> {
  return currentProjectHeadingBackend().unarchiveProjectHeading(id);
}
