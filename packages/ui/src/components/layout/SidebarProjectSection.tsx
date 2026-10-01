import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
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

import { NavLink } from 'react-router-dom';

import { ProjectStatus } from '@taskora/shared';
import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';

import { SortableProjectItem } from '@/components/layout/SortableProjectItem';
import { SortableAreaRow } from '@/components/layout/SortableAreaRow';
import { ProjectItem } from '@/components/project/ProjectItem';
import { useLaterProjectKind, useReorderProjects, useUpdateProject } from '@taskora/api';
import { useReorderAreas } from '@taskora/api';
import {
  dndListProps,
  dragOverlayClass,
  dropAnimation,
  flipId,
  noopSortingStrategy,
  useFlipList,
  useHeldOrder,
} from '../../lib/dnd';
import { cn } from '@/lib/utils';
import { sidebarRowClass } from '@/components/layout/sidebarRowClass';
import {
  AREA_DND_PREFIX,
  PROJECT_CONTAINER_DND_PREFIX,
  PROJECT_DND_PREFIX,
  STANDALONE_HEADING_DND_ID,
  STANDALONE_PROJECT_CONTAINER,
  areaDndId,
  cloneSidebarProjectLayout,
  findProjectContainer,
  mergeVisibleProjectOrder,
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
  /** 全部未进回收站的项目；已完成与稍后项目在此过滤，但参与排序持久化。 */
  projects: ProjectResponseDto[];
  areas: AreaResponseDto[];
}

interface ProjectContainerProps {
  projectIds: string[];
  projectMap: Map<string, ProjectResponseDto>;
  activeProjectId: string | null;
}

function StandaloneProjectContainer({
  projectIds,
  projectMap,
  activeProjectId,
}: ProjectContainerProps) {
  const { setNodeRef } = useDroppable({
    id: projectContainerDndId(STANDALONE_PROJECT_CONTAINER),
  });

  return (
    <SortableContext
      items={projectIds.map(projectDndId)}
      strategy={noopSortingStrategy}
    >
      <div
        ref={setNodeRef}
        data-project-container={STANDALONE_PROJECT_CONTAINER}
        className="flex flex-col gap-px"
      >
        {projectIds.map((id) => {
          const project = projectMap.get(id);
          if (!project) return null;
          return (
            <SortableProjectItem
              key={id}
              project={project}
              placeholder={id === activeProjectId}
            />
          );
        })}
      </div>
    </SortableContext>
  );
}

/**
 * 「项目」section 标题。同时是无区域列表的首位放置目标：无区域列表为空时
 * 不再在拖拽中预留空白高度，而是靠标题承接拖入。
 */
function ProjectSectionHeading() {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({ id: STANDALONE_HEADING_DND_ID });
  return (
    <div
      ref={setNodeRef}
      className="px-2 pb-1 text-meta font-semibold text-muted-foreground"
    >
      {t('nav:projects')}
    </div>
  );
}

/** 无区域稍后项目的汇总入口：固定在无区域项目列表末尾，不可拖动、不参与排序。 */
function LaterProjectsEntry({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <NavLink
      {...flipId('later-projects')}
      to="/later-projects"
      className={({ isActive }) =>
        sidebarRowClass(isActive, isActive ? undefined : 'text-muted-foreground')
      }
    >
      <span aria-hidden className="w-4 shrink-0" />
      <span className="truncate">{t('project:laterProjectCount', { count })}</span>
    </NavLink>
  );
}

/**
 * 侧边栏合并后的统一「项目」section。
 * 项目拖拽使用本地布局预览；区域拖拽继续使用独立的 area-only 排序路径。
 */
export function SidebarProjectSection({ projects: allProjects, areas }: Props) {
  const { t } = useTranslation();
  const kindOf = useLaterProjectKind();
  // 侧边栏只放活跃项目：已完成与稍后项目（Someday / 未来日期）都不显示。
  const projects = React.useMemo(
    () =>
      allProjects.filter(
        (project) => project.status !== ProjectStatus.COMPLETED && kindOf(project) === null,
      ),
    [allProjects, kindOf],
  );
  const laterCount = React.useMemo(() => {
    const areaIds = new Set(areas.map((area) => area.id));
    return allProjects.filter(
      (project) =>
        !(project.areaId && areaIds.has(project.areaId)) && kindOf(project) !== null,
    ).length;
  }, [allProjects, areas, kindOf]);
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
  // 本组件同时用于桌面侧边栏与手机「更多」抽屉：触摸需按住 300ms 再移动
  // 才进入拖拽，避免抽屉内滚动列表时误触。
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  const flip = useFlipList<HTMLDivElement>(layout);
  // 区域拖拽走标准让位排序；松手后先按本地顺序渲染，等乐观更新追上。
  const [orderedAreas, holdAreaOrder] = useHeldOrder(areas, areaKey);

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
    const orderedIds = mergeVisibleProjectOrder(
      allProjects,
      serializeProjectOrder(next, areas),
    );
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
        id === STANDALONE_HEADING_DND_ID ||
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
      collisions.find(
        ({ id }) =>
          String(id).startsWith(AREA_DND_PREFIX) ||
          id === STANDALONE_HEADING_DND_ID,
      );
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
    if (!next) return;
    flip.capture();
    updateRenderedLayout(next);
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
    const areaIds = orderedAreas.map((area) => areaDndId(area.id));
    const oldIndex = areaIds.indexOf(activeKey);
    const newIndex = areaIds.indexOf(overKey);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(areaIds, oldIndex, newIndex).map((id) =>
      id.slice(AREA_DND_PREFIX.length),
    );
    holdAreaOrder(reordered);
    reorderAreas.mutate(reordered);
  };

  const handleDragCancel = () => {
    if (activeProjectIdRef.current !== null) restoreProjectDrag();
  };

  const activeProjectId = activeProject?.id ?? null;

  return (
    <div ref={flip.rootRef} {...dndListProps} className="flex flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        autoScroll={{
          // 侧边栏内容在 Radix ScrollArea 里滚动。dnd-kit 默认 autoScroll
          // （20% 边缘区 + 5ms 间隔 + 10 加速度）在列表可滚动时会把指针
          // 进入底部边缘区的拖拽变成 ~2000px/s 的失控狂滚：占位符扫过
          // 整列、drop 落到相邻区域或列表末尾，观感上就是「拖不动/乱跳」。
          // 收窄边缘区并放缓滚动，保留「贴边轻滚」的定位手感。
          threshold: { x: 0.2, y: 0.06 },
          acceleration: 4,
          interval: 20,
        }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <ProjectSectionHeading />
        <div className="flex flex-col gap-px">
          <StandaloneProjectContainer
            projectIds={
              layout.containers[STANDALONE_PROJECT_CONTAINER] ?? []
            }
            projectMap={projectMap}
            activeProjectId={activeProjectId}
          />
          {laterCount > 0 && <LaterProjectsEntry count={laterCount} />}
          <SortableContext
            items={orderedAreas.map((area) => areaDndId(area.id))}
            strategy={verticalListSortingStrategy}
          >
            {orderedAreas.map((area) => {
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
                />
              );
            })}
          </SortableContext>
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeProject ? (
            <div
              className={cn(dragOverlayClass, 'bg-sidebar')}
              aria-hidden="true"
              {...{ inert: '' }}
            >
              <ProjectItem project={activeProject} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function areaKey(area: AreaResponseDto) {
  return area.id;
}
