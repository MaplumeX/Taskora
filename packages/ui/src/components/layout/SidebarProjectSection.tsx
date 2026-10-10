import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  DragOverlay,
  closestCenter,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';

import { NavLink, useNavigate } from 'react-router-dom';

import { ProjectBucket, ProjectStatus, ScheduledType } from '@taskora/shared';
import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';

import { SortableProjectItem } from '@/components/layout/SortableProjectItem';
import { SortableAreaRow } from '@/components/layout/SortableAreaRow';
import { ProjectItem } from '@/components/project/ProjectItem';
import {
  useCreateProject,
  useIsLogged,
  useLaterProjectKind,
  useReorderProjects,
  useUiInteractionStore,
  useUpdateProject,
} from '@taskora/api';
import { useReorderAreas } from '@taskora/api';
import { SIDEBAR_AUTO_SCROLL, useDndSurface } from '../../lib/appDnd';
import { MAGIC_PLUS_DRAFT_ID, isMagicPlus } from '../../lib/magicPlus';
import {
  dndListProps,
  dragOverlayClass,
  dragOverlayWrapperClass,
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
  placeProject,
  projectContainerDndId,
  projectDndId,
  resolveProjectPlacement,
  serializeProjectOrder,
  sidebarProjectLayoutsEqual,
  type ProjectPlacementEdge,
  type SidebarProjectLayout,
} from '@/components/layout/sidebarProjectLayout';

interface Props {
  /** 全部未进废纸篓的项目；已完成与稍后项目在此过滤，但参与排序持久化。 */
  projects: ProjectResponseDto[];
  areas: AreaResponseDto[];
  /** 项目与区域行作为 Sidebar Drop 落点（仅桌面侧边栏；手机「更多」页不接收）。 */
  dropTargets?: boolean;
  /**
   * 接收 Magic Plus（仅手机首页）：落在某个区域里即在该区域新建项目，落在
   * 无区域部分即新建顶层项目，位于落点；随后进入项目页编辑标题。
   */
  magicPlus?: boolean;
}

/** Magic Plus 草稿项目（只用于渲染空位）。 */
function draftProjectOf(): ProjectResponseDto {
  const now = new Date(0).toISOString();
  return {
    id: MAGIC_PLUS_DRAFT_ID,
    title: '',
    notes: null,
    areaId: null,
    status: ProjectStatus.ACTIVE,
    bucket: ProjectBucket.ANYTIME,
    scheduledType: ScheduledType.NONE,
    scheduledDate: null,
    dueDate: null,
    completedAt: null,
    trashedAt: null,
    tags: [],
    taskTotalCount: 0,
    taskCompletedCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

interface ProjectContainerProps {
  projectIds: string[];
  projectMap: Map<string, ProjectResponseDto>;
  activeProjectId: string | null;
  dropTargets: boolean;
}

function StandaloneProjectContainer({
  projectIds,
  projectMap,
  activeProjectId,
  dropTargets,
}: ProjectContainerProps) {
  const { setNodeRef } = useDroppable({
    id: projectContainerDndId(STANDALONE_PROJECT_CONTAINER),
  });

  return (
    <SortableContext items={projectIds.map(projectDndId)} strategy={noopSortingStrategy}>
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
              dropTarget={dropTargets}
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
    <div ref={setNodeRef} className="px-2 pb-1 text-meta font-semibold text-muted-foreground">
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
      data-sidebar-nav="/later-projects"
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
export function SidebarProjectSection({
  projects: allProjects,
  areas,
  dropTargets = false,
  magicPlus = false,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createProject = useCreateProject();
  /** Magic Plus 草稿：开始拖动到新项目建好（或取消）期间在布局里占位。 */
  const [draftProject, setDraftProject] = React.useState<ProjectResponseDto | null>(null);
  const kindOf = useLaterProjectKind();
  const isLogged = useIsLogged();
  // 侧边栏只放活跃项目：已移入 Logbook 的已完成项目与稍后项目（Someday /
  // 未来日期）都不显示；尚未移入的已完成项目留在原位（Logging Mode）。
  const projects = React.useMemo(
    () =>
      allProjects.filter(
        (project) =>
          (project.status !== ProjectStatus.COMPLETED || !isLogged(project)) &&
          kindOf(project) === null,
      ),
    [allProjects, kindOf, isLogged],
  );
  const laterCount = React.useMemo(() => {
    const areaIds = new Set(areas.map((area) => area.id));
    return allProjects.filter(
      (project) => !(project.areaId && areaIds.has(project.areaId)) && kindOf(project) !== null,
    ).length;
  }, [allProjects, areas, kindOf]);
  const serverLayout = React.useMemo(
    () => normalizeSidebarProjectLayout(projects, areas),
    [projects, areas],
  );
  const [layout, setLayout] = React.useState(serverLayout);
  const [activeProject, setActiveProject] = React.useState<ProjectResponseDto | null>(null);
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

  const projectMap = React.useMemo(() => {
    const map = new Map(projects.map((project) => [project.id, project]));
    if (draftProject) map.set(draftProject.id, draftProject);
    return map;
  }, [projects, draftProject]);
  const reorderProjects = useReorderProjects();
  const reorderAreas = useReorderAreas();
  const updateProject = useUpdateProject();

  const flip = useFlipList<HTMLDivElement>(layout);
  // 区域拖拽走标准让位排序；松手后先按本地顺序渲染，等乐观更新追上。
  const [orderedAreas, holdAreaOrder] = useHeldOrder(areas, areaKey);

  const updateRenderedLayout = React.useCallback((next: SidebarProjectLayout) => {
    layoutRef.current = next;
    setLayout(next);
  }, []);

  React.useEffect(() => {
    if (activeProjectIdRef.current !== null || persistenceActiveRef.current) {
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
    const restored = pendingServerLayoutRef.current ?? dragStartLayoutRef.current;
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
    const orderedIds = mergeVisibleProjectOrder(allProjects, serializeProjectOrder(next, areas));
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
          areaId: targetContainerId === STANDALONE_PROJECT_CONTAINER ? null : targetContainerId,
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
    if (!activeKey.startsWith(PROJECT_DND_PREFIX) && !isMagicPlus(activeKey)) return [];

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
      collisions.find(({ id }) => String(id).startsWith(PROJECT_CONTAINER_DND_PREFIX)) ??
      collisions.find(
        ({ id }) => String(id).startsWith(AREA_DND_PREFIX) || id === STANDALONE_HEADING_DND_ID,
      );
    if (!collision) return [];

    const overKey = String(collision.id);
    let edge: ProjectPlacementEdge = 'before';
    if (overKey.startsWith(PROJECT_DND_PREFIX)) {
      const rect = args.droppableRects.get(collision.id);
      if (rect) {
        edge = args.pointerCoordinates.y >= rect.top + rect.height / 2 ? 'after' : 'before';
      }
    }
    lastProjectTargetRef.current = { overKey, edge };
    return [collision];
  }, []);

  /** 拖拽源 dnd id → 布局里的项目 id（Magic Plus 为草稿）。 */
  const draggedProjectId = (activeKey: string) => {
    if (isMagicPlus(activeKey)) return MAGIC_PLUS_DRAFT_ID;
    return activeKey.startsWith(PROJECT_DND_PREFIX)
      ? activeKey.slice(PROJECT_DND_PREFIX.length)
      : null;
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const activeKey = String(active.id);
    if (isMagicPlus(activeKey)) {
      const draft = draftProjectOf();
      dragStartLayoutRef.current = cloneSidebarProjectLayout(layoutRef.current);
      pendingServerLayoutRef.current = null;
      activeProjectIdRef.current = draft.id;
      lastProjectTargetRef.current = null;
      setDraftProject(draft);
      setActiveProject(draft);
      return;
    }
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
    const activeId = draggedProjectId(activeKey);
    if (!activeId || activeProjectIdRef.current !== activeId) return;

    const target = lastProjectTargetRef.current;
    if (!target) return;
    const placement = resolveProjectPlacement(layoutRef.current, target.overKey, target.edge);
    if (!placement) return;
    const next = placeProject(layoutRef.current, activeId, placement);
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
    if (!draggedProjectId(activeKey) || !over) return;

    const overKey = String(over.id);
    if (lastProjectTargetRef.current?.overKey !== overKey) {
      lastProjectTargetRef.current = { overKey, edge: 'before' };
    }
    previewProjectTarget(activeKey);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const activeKey = String(active.id);
    if (isMagicPlus(activeKey)) {
      dropMagicPlus(over ? String(over.id) : null);
      return;
    }
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
        finalLayout = moveProjectToPlacement(finalLayout, activeId, placement) ?? finalLayout;
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
    setDraftProject(null);
  };

  /**
   * Magic Plus 松手：草稿所在的区域（或无区域部分）即新项目的归属，位于落点。
   * 先以含草稿的布局占位；建好后按新顺序写回（草稿换成新项目），进入项目页
   * 编辑标题。没落在任何落点即取消。
   */
  const dropMagicPlus = (overKey: string | null) => {
    const edge =
      overKey !== null && lastProjectTargetRef.current?.overKey === overKey
        ? lastProjectTargetRef.current.edge
        : 'before';
    const placement =
      overKey !== null ? resolveProjectPlacement(layoutRef.current, overKey, edge) : null;
    const placed = placement
      ? (placeProject(layoutRef.current, MAGIC_PLUS_DRAFT_ID, placement) ?? layoutRef.current)
      : layoutRef.current;
    const containerId = findProjectContainer(placed, MAGIC_PLUS_DRAFT_ID);
    if (!containerId) {
      restoreProjectDrag();
      setDraftProject(null);
      return;
    }
    cleanupProjectDrag();
    persistenceActiveRef.current = true;
    updateRenderedLayout(placed);
    const areaId = containerId === STANDALONE_PROJECT_CONTAINER ? undefined : containerId;
    createProject.mutate(areaId ? { title: '', areaId } : { title: '' }, {
      onSuccess: (created) => {
        const withCreated = cloneSidebarProjectLayout(placed);
        withCreated.containers[containerId] = withCreated.containers[containerId].map((id) =>
          id === MAGIC_PLUS_DRAFT_ID ? created.id : id,
        );
        reorderProjects.mutate(
          mergeVisibleProjectOrder(
            [...allProjects, created],
            serializeProjectOrder(withCreated, areas),
          ),
        );
        persistenceActiveRef.current = false;
        setDraftProject(null);
        useUiInteractionStore.getState().setPendingAutoEditId(created.id);
        navigate(`/projects/${created.id}`);
      },
      onError: () => {
        persistenceActiveRef.current = false;
        setDraftProject(null);
        updateRenderedLayout(pendingServerLayoutRef.current ?? serverLayoutRef.current);
        pendingServerLayoutRef.current = null;
        toast.error(t('common:createFailed'));
      },
    });
  };

  // 侧边栏的项目 / 区域排序是共享拖拽上下文里的一个 surface（ADR 0018）。
  const surface = useDndSurface({
    owns: isSidebarSortKey,
    magicPlus,
    collisionDetection,
    autoScroll: SIDEBAR_AUTO_SCROLL,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    onDragCancel: handleDragCancel,
  });

  const activeProjectId = activeProject?.id ?? null;

  return (
    <div ref={flip.rootRef} {...dndListProps} className="flex flex-col">
      <ProjectSectionHeading />
      <div className="flex flex-col gap-px">
        <StandaloneProjectContainer
          projectIds={layout.containers[STANDALONE_PROJECT_CONTAINER] ?? []}
          projectMap={projectMap}
          activeProjectId={activeProjectId}
          dropTargets={dropTargets}
        />
        {laterCount > 0 && <LaterProjectsEntry count={laterCount} />}
        <SortableContext
          items={orderedAreas.map((area) => areaDndId(area.id))}
          strategy={verticalListSortingStrategy}
        >
          {orderedAreas.map((area) => {
            const areaProjects = (layout.containers[area.id] ?? []).flatMap((id) => {
              const project = projectMap.get(id);
              return project ? [project] : [];
            });
            return (
              <SortableAreaRow
                key={area.id}
                area={area}
                projects={areaProjects}
                activeProjectId={activeProjectId}
                dropTargets={dropTargets}
              />
            );
          })}
        </SortableContext>
      </div>
      {surface.overlayActive && (
        <DragOverlay className={dragOverlayWrapperClass} dropAnimation={surface.dropAnimation}>
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
      )}
    </div>
  );
}

function isSidebarSortKey(id: string) {
  return (
    id.startsWith(PROJECT_DND_PREFIX) ||
    id.startsWith(AREA_DND_PREFIX) ||
    id.startsWith(PROJECT_CONTAINER_DND_PREFIX) ||
    id === STANDALONE_HEADING_DND_ID
  );
}

function areaKey(area: AreaResponseDto) {
  return area.id;
}
