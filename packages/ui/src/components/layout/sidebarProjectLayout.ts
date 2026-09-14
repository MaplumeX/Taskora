import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';

export const STANDALONE_PROJECT_CONTAINER = 'standalone';
export const PROJECT_DND_PREFIX = 'proj:';
export const AREA_DND_PREFIX = 'area:';
export const PROJECT_CONTAINER_DND_PREFIX = 'project-container:';

export type ProjectContainerId = typeof STANDALONE_PROJECT_CONTAINER | string;
export type ProjectPlacementEdge = 'before' | 'after';

export interface SidebarProjectLayout {
  containers: Record<ProjectContainerId, string[]>;
}

export interface ProjectPlacement {
  containerId: ProjectContainerId;
  index: number;
}

export function projectDndId(id: string) {
  return `${PROJECT_DND_PREFIX}${id}`;
}

export function areaDndId(id: string) {
  return `${AREA_DND_PREFIX}${id}`;
}

export function projectContainerDndId(id: ProjectContainerId) {
  return `${PROJECT_CONTAINER_DND_PREFIX}${id}`;
}

export function normalizeSidebarProjectLayout(
  projects: ProjectResponseDto[],
  areas: AreaResponseDto[],
): SidebarProjectLayout {
  const areaIds = new Set(areas.map((area) => area.id));
  const containers: Record<string, string[]> = {
    [STANDALONE_PROJECT_CONTAINER]: [],
  };
  areas.forEach((area) => {
    containers[area.id] = [];
  });
  projects.forEach((project) => {
    const containerId =
      project.areaId && areaIds.has(project.areaId)
        ? project.areaId
        : STANDALONE_PROJECT_CONTAINER;
    containers[containerId].push(project.id);
  });
  return { containers };
}

export function cloneSidebarProjectLayout(
  layout: SidebarProjectLayout,
): SidebarProjectLayout {
  return {
    containers: Object.fromEntries(
      Object.entries(layout.containers).map(([id, projectIds]) => [
        id,
        [...projectIds],
      ]),
    ),
  };
}

export function sidebarProjectLayoutsEqual(
  left: SidebarProjectLayout,
  right: SidebarProjectLayout,
) {
  const containerIds = Object.keys(left.containers);
  if (containerIds.length !== Object.keys(right.containers).length) return false;
  return containerIds.every((containerId) => {
    const leftIds = left.containers[containerId];
    const rightIds = right.containers[containerId];
    return (
      rightIds !== undefined &&
      leftIds.length === rightIds.length &&
      leftIds.every((id, index) => id === rightIds[index])
    );
  });
}

export function findProjectContainer(
  layout: SidebarProjectLayout,
  projectId: string,
): ProjectContainerId | undefined {
  return Object.keys(layout.containers).find((containerId) =>
    layout.containers[containerId].includes(projectId),
  );
}

export function resolveProjectPlacement(
  layout: SidebarProjectLayout,
  overKey: string,
  edge: ProjectPlacementEdge,
): ProjectPlacement | null {
  if (overKey.startsWith(PROJECT_DND_PREFIX)) {
    const overProjectId = overKey.slice(PROJECT_DND_PREFIX.length);
    const containerId = findProjectContainer(layout, overProjectId);
    if (!containerId) return null;
    const overIndex = layout.containers[containerId].indexOf(overProjectId);
    if (overIndex < 0) return null;
    return {
      containerId,
      index: overIndex + (edge === 'after' ? 1 : 0),
    };
  }

  if (overKey.startsWith(AREA_DND_PREFIX)) {
    const containerId = overKey.slice(AREA_DND_PREFIX.length);
    if (!layout.containers[containerId]) return null;
    return { containerId, index: 0 };
  }

  if (overKey.startsWith(PROJECT_CONTAINER_DND_PREFIX)) {
    const containerId = overKey.slice(PROJECT_CONTAINER_DND_PREFIX.length);
    const projectIds = layout.containers[containerId];
    if (!projectIds) return null;
    return { containerId, index: projectIds.length };
  }

  return null;
}

export function moveProjectToPlacement(
  layout: SidebarProjectLayout,
  activeProjectId: string,
  placement: ProjectPlacement,
): SidebarProjectLayout | null {
  const sourceContainerId = findProjectContainer(layout, activeProjectId);
  const targetIds = layout.containers[placement.containerId];
  if (!sourceContainerId || !targetIds) return null;

  const sourceIds = layout.containers[sourceContainerId];
  const sourceIndex = sourceIds.indexOf(activeProjectId);
  let insertionIndex = Math.max(0, Math.min(placement.index, targetIds.length));
  if (sourceContainerId === placement.containerId && sourceIndex < insertionIndex) {
    insertionIndex -= 1;
  }
  const maxIndexAfterRemoval =
    sourceContainerId === placement.containerId
      ? targetIds.length - 1
      : targetIds.length;
  insertionIndex = Math.min(insertionIndex, maxIndexAfterRemoval);

  if (
    sourceContainerId === placement.containerId &&
    sourceIndex === insertionIndex
  ) {
    return null;
  }

  const next = cloneSidebarProjectLayout(layout);
  next.containers[sourceContainerId].splice(sourceIndex, 1);
  next.containers[placement.containerId].splice(
    insertionIndex,
    0,
    activeProjectId,
  );
  return next;
}

export function serializeProjectOrder(
  layout: SidebarProjectLayout,
  areas: AreaResponseDto[],
): string[] {
  return [
    ...(layout.containers[STANDALONE_PROJECT_CONTAINER] ?? []),
    ...areas.flatMap((area) => layout.containers[area.id] ?? []),
  ];
}
