import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';

import { SortableProjectItem } from '@/components/layout/SortableProjectItem';
import { SortableAreaRow } from '@/components/layout/SortableAreaRow';
import { ProjectItem } from '@/components/project/ProjectItem';
import { useReorderProjects, useUpdateProject } from '@/lib/hooks/useProjects';
import { useReorderAreas } from '@/lib/hooks/useAreas';
import { cn } from '@/lib/utils';
import {
  AREA_DND_PREFIX,
  PROJECT_CONTAINER_DND_PREFIX,
  PROJECT_DND_PREFIX,
  STANDALONE_PROJECT_CONTAINER,
  areaDndId,
  cloneSidebarProjectLayout,
  findProjectContainer,
  moveProjectToPlacement,
  normalizeSidebarProjectLayout,
  projectContainerDndId,
  projectDndId,
  resolveProjectPlacement,
  serializeProjectOrder,
  sidebarProjectLayoutsEqual,
  type ProjectPlacementEdge,
  type SidebarProjectLayout,
} from '@/components/layout/sidebarProjectLayout';

interface Props {
  projects: ProjectResponseDto[];
  areas: AreaResponseDto[];
}

interface ProjectContainerProps {
  projectIds: string[];
  projectMap: Map<string, ProjectResponseDto>;
  activeProjectId: string | null;
  projectDragActive: boolean;
}

function StandaloneProjectContainer({
  projectIds,
  projectMap,
  activeProjectId,
  projectDragActive,
}: ProjectContainerProps) {
  const { setNodeRef } = useDroppable({
    id: projectContainerDndId(STANDALONE_PROJECT_CONTAINER),
  });

  return (
    <SortableContext
      items={projectIds.map(projectDndId)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        data-project-container={STANDALONE_PROJECT_CONTAINER}
        className={cn(
          'flex flex-col gap-0.5',
          projectDragActive && projectIds.length === 0 && 'min-h-8',
        )}
      >
        {projectIds.map((id) => {
          const project = projectMap.get(id);
          if (!project) return null;
          return (
            <SortableProjectItem
              key={id}
              project={project}
              placeholder={id === activeProjectId}
              projectDragActive={projectDragActive}
            />
          );
        })}
      </div>
    </SortableContext>
  );
}

/**
 * 侧边栏合并后的统一「项目」section。
 * 项目拖拽使用本地布局预览；区域拖拽继续使用独立的 area-only 排序路径。
 */
export function SidebarProjectSection({ projects, areas }: Props) {
  const { t } = useTranslation();
  const serverLayout = React.useMemo(
    () => normalizeSidebarProjectLayout(projects, areas),
    [projects, areas],
  );
  const [layout, setLayout] = React.useState(serverLayout);
  const [activeProject, setActiveProject] =
    React.useState<ProjectResponseDto | null>(null);
  const layoutRef = React.useRef(layout);
  const serverLayoutRef = React.useRef(serverLayout);
  const dragStartLayoutRef = React.useRef<SidebarProjectLayout | null>(null);
  const pendingServerLayoutRef = React.useRef<SidebarProjectLayout | null>(null);
  const activeProjectIdRef = React.useRef<string | null>(null);
  const persistenceActiveRef = React.useRef(false);
  const lastProjectTargetRef = React.useRef<{
    overKey: string;
    edge: ProjectPlacementEdge;
  } | null>(null);
  serverLayoutRef.current = serverLayout;

  const projectMap = React.useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const reorderProjects = useReorderProjects();
  const reorderAreas = useReorderAreas();
  const updateProject = useUpdateProject();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const updateRenderedLayout = React.useCallback(
    (next: SidebarProjectLayout) => {
      layoutRef.current = next;
      setLayout(next);
    },
    [],
  );

  React.useEffect(() => {
    if (
      activeProjectIdRef.current !== null ||
      persistenceActiveRef.current
    ) {
      pendingServerLayoutRef.current = serverLayout;
      return;
    }
    pendingServerLayoutRef.current = null;
    updateRenderedLayout(serverLayout);
  }, [serverLayout, updateRenderedLayout]);

  const cleanupProjectDrag = () => {
    activeProjectIdRef.current = null;
    dragStartLayoutRef.current = null;
    pendingServerLayoutRef.current = null;
    lastProjectTargetRef.current = null;
    setActiveProject(null);
  };

  const restoreProjectDrag = () => {
    const restored =
      pendingServerLayoutRef.current ?? dragStartLayoutRef.current;
    cleanupProjectDrag();
    if (restored) updateRenderedLayout(restored);
  };

  const persistProjectLayout = (
    snapshot: SidebarProjectLayout,
    next: SidebarProjectLayout,
    activeProjectId: string,
  ) => {
    const sourceContainerId = findProjectContainer(snapshot, activeProjectId);
    const targetContainerId = findProjectContainer(next, activeProjectId);
    if (!sourceContainerId || !targetContainerId) {
      updateRenderedLayout(serverLayoutRef.current);
      return;
    }

    const rollbackLayout = cloneSidebarProjectLayout(serverLayoutRef.current);
    const orderedIds = serializeProjectOrder(next, areas);
    persistenceActiveRef.current = true;
    updateRenderedLayout(next);

    const finishPersistence = () => {
      persistenceActiveRef.current = false;
      pendingServerLayoutRef.current = null;
    };
    const handleSaveError = () => {
      finishPersistence();
      updateRenderedLayout(rollbackLayout);
      toast.error(t('common:saveFailed'));
    };
    const reorder = () => {
      reorderProjects.mutate(orderedIds, {
        onSuccess: finishPersistence,
        onError: handleSaveError,
      });
    };

    if (sourceContainerId === targetContainerId) {
      reorder();
      return;
    }

    updateProject.mutate(
      {
        id: activeProjectId,
        data: {
          areaId:
            targetContainerId === STANDALONE_PROJECT_CONTAINER
              ? null
              : targetContainerId,
        },
      },
      {
        onSuccess: reorder,
        onError: handleSaveError,
      },
    );
  };

  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const activeKey = String(args.active.id);
    if (activeKey.startsWith(AREA_DND_PREFIX)) {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) =>
          String(container.id).startsWith(AREA_DND_PREFIX),
        ),
      });
    }
    if (!activeKey.startsWith(PROJECT_DND_PREFIX)) return [];

    const compatibleContainers = args.droppableContainers.filter((container) => {
      const id = String(container.id);
      return (
        id.startsWith(PROJECT_DND_PREFIX) ||
        id.startsWith(PROJECT_CONTAINER_DND_PREFIX) ||
        id.startsWith(AREA_DND_PREFIX)
      );
    });
    if (!args.pointerCoordinates) return [];
    const collisions = pointerWithin({
      ...args,
      droppableContainers: compatibleContainers,
    });
    if (collisions.length === 0) return [];

    const collision =
      collisions.find(({ id }) => String(id).startsWith(PROJECT_DND_PREFIX)) ??
      collisions.find(({ id }) =>
        String(id).startsWith(PROJECT_CONTAINER_DND_PREFIX),
      ) ??
      collisions.find(({ id }) => String(id).startsWith(AREA_DND_PREFIX));
    if (!collision) return [];

    const overKey = String(collision.id);
    let edge: ProjectPlacementEdge = 'before';
    if (overKey.startsWith(PROJECT_DND_PREFIX)) {
      const rect = args.droppableRects.get(collision.id);
      if (rect) {
        edge =
          args.pointerCoordinates.y >= rect.top + rect.height / 2
            ? 'after'
            : 'before';
      }
    }
    lastProjectTargetRef.current = { overKey, edge };
    return [collision];
  }, []);

  const handleDragStart = ({ active }: DragStartEvent) => {
    const activeKey = String(active.id);
    if (!activeKey.startsWith(PROJECT_DND_PREFIX)) return;
    const activeId = activeKey.slice(PROJECT_DND_PREFIX.length);
    const project = projectMap.get(activeId);
    if (!project) return;

    dragStartLayoutRef.current = cloneSidebarProjectLayout(layoutRef.current);
    pendingServerLayoutRef.current = null;
    activeProjectIdRef.current = activeId;
    lastProjectTargetRef.current = null;
    setActiveProject(project);
  };

  const previewProjectTarget = (activeKey: string) => {
    if (!activeKey.startsWith(PROJECT_DND_PREFIX)) return;
    const activeId = activeKey.slice(PROJECT_DND_PREFIX.length);
    if (activeProjectIdRef.current !== activeId) return;

    const target = lastProjectTargetRef.current;
    if (!target) return;
    const placement = resolveProjectPlacement(
      layoutRef.current,
      target.overKey,
      target.edge,
    );
    if (!placement) return;
    const next = moveProjectToPlacement(layoutRef.current, activeId, placement);
    if (next) updateRenderedLayout(next);
  };

  const handleDragMove = ({ active }: DragMoveEvent) => {
    // dnd-kit only emits onDragOver when over.id changes. Read the edge captured
    // by collision detection on every pointer move so crossing one row's midpoint
    // updates the placeholder without requiring a different target id.
    previewProjectTarget(String(active.id));
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const activeKey = String(active.id);
    if (!activeKey.startsWith(PROJECT_DND_PREFIX) || !over) return;

    const overKey = String(over.id);
    if (lastProjectTargetRef.current?.overKey !== overKey) {
      lastProjectTargetRef.current = { overKey, edge: 'before' };
    }
    previewProjectTarget(activeKey);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const activeKey = String(active.id);
    if (activeKey.startsWith(PROJECT_DND_PREFIX)) {
      const activeId = activeKey.slice(PROJECT_DND_PREFIX.length);
      const snapshot = dragStartLayoutRef.current;
      if (!snapshot || activeProjectIdRef.current !== activeId) {
        cleanupProjectDrag();
        return;
      }

      let finalLayout = layoutRef.current;
      if (over) {
        const overKey = String(over.id);
        const edge =
          lastProjectTargetRef.current?.overKey === overKey
            ? lastProjectTargetRef.current.edge
            : 'before';
        const placement = resolveProjectPlacement(finalLayout, overKey, edge);
        if (!placement) {
          restoreProjectDrag();
          return;
        }
        finalLayout =
          moveProjectToPlacement(finalLayout, activeId, placement) ?? finalLayout;
      }

      if (sidebarProjectLayoutsEqual(snapshot, finalLayout)) {
        restoreProjectDrag();
        return;
      }

      cleanupProjectDrag();
      persistProjectLayout(snapshot, finalLayout, activeId);
      return;
    }

    if (!over || !activeKey.startsWith(AREA_DND_PREFIX)) return;
    const overKey = String(over.id);
    if (!overKey.startsWith(AREA_DND_PREFIX) || activeKey === overKey) return;
    const areaIds = areas.map((area) => areaDndId(area.id));
    const oldIndex = areaIds.indexOf(activeKey);
    const newIndex = areaIds.indexOf(overKey);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderAreas.mutate(
      arrayMove(areaIds, oldIndex, newIndex).map((id) =>
        id.slice(AREA_DND_PREFIX.length),
      ),
    );
  };

  const handleDragCancel = () => {
    if (activeProjectIdRef.current !== null) restoreProjectDrag();
  };

  const activeProjectId = activeProject?.id ?? null;
  const projectDragActive = activeProject !== null;

  return (
    <div className="flex flex-col gap-1">
      <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground">
        {t('nav:projects')}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="ml-2 flex flex-col gap-0.5">
          <StandaloneProjectContainer
            projectIds={
              layout.containers[STANDALONE_PROJECT_CONTAINER] ?? []
            }
            projectMap={projectMap}
            activeProjectId={activeProjectId}
            projectDragActive={projectDragActive}
          />
          <SortableContext
            items={areas.map((area) => areaDndId(area.id))}
            strategy={verticalListSortingStrategy}
          >
            {areas.map((area) => {
              const areaProjects = (layout.containers[area.id] ?? []).flatMap(
                (id) => {
                  const project = projectMap.get(id);
                  return project ? [project] : [];
                },
              );
              return (
                <SortableAreaRow
                  key={area.id}
                  area={area}
                  projects={areaProjects}
                  activeProjectId={activeProjectId}
                  projectDragActive={projectDragActive}
                />
              );
            })}
          </SortableContext>
        </div>
        <DragOverlay>
          {activeProject ? (
            <div
              className="pointer-events-none w-56 overflow-hidden rounded-lg border border-border/70 bg-card shadow-md"
              aria-hidden="true"
              {...{ inert: '' }}
            >
              <ProjectItem project={activeProject} showChevron={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
