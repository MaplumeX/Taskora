import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';

import type { FeedItem, TaskFeedItem, UpdateTaskDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { FeedItemRow } from './FeedItemRow';
import { FeedEmptyHint } from './FeedListView';
import { ProjectGroupHeaderRow } from './ProjectGroupHeaderRow';
import { AreaGroupHeaderRow } from './AreaGroupHeaderRow';
import {
  deriveGroupedFeedLayout,
  type GroupedFeedBlock,
  type GroupedFeedLayout,
} from './groupedFeedLayout';
import {
  selectionStateOf,
  useAreasQuery,
  useCompleteTask,
  useGroupedViewCollapseStore,
  useProjectsQuery,
  useReorderTasks,
  useSelectionScope,
  useSelectionStore,
  useTaskRowSelection,
  useUncompleteTask,
  useUpdateTask,
  type SelectionState,
  type SelectionRow,
} from '@taskora/api';

type GroupedTimeView = 'today' | 'anytime' | 'someday';

interface Props {
  view: GroupedTimeView;
  items: FeedItem[];
  emptyHint?: string;
}

const UNGROUPED = 'ungrouped';
type ContainerId = typeof UNGROUPED | string;

const TASK_DND_PREFIX = 'task:';
const CONTAINER_DND_PREFIX = 'container:';
const HEADER_DND_PREFIX = 'header:';

type PlacementEdge = 'before' | 'after';

export interface GroupedFeedPlacement {
  containerId: ContainerId;
  index: number;
}

export function taskDndId(id: string) {
  return `${TASK_DND_PREFIX}${id}`;
}

export function containerDndId(id: ContainerId) {
  return `${CONTAINER_DND_PREFIX}${id}`;
}

export function headerDndId(id: string) {
  return `${HEADER_DND_PREFIX}${id}`;
}

/**
 * 由推导结果播种拖拽容器：ungrouped 装顶部浮动任务；每个组头容器装
 * 其成员任务（折叠组也保有完整成员，投向折叠组时才能落到组末尾）。
 */
export function containersFromLayout(layout: GroupedFeedLayout): {
  zoneOrder: ContainerId[];
  containers: Record<ContainerId, string[]>;
} {
  const containers: Record<ContainerId, string[]> = { [UNGROUPED]: [] };
  const zoneOrder: ContainerId[] = [UNGROUPED];
  for (const block of layout.blocks) {
    if (block.kind === 'task') {
      if (block.groupHeaderId === null) containers[UNGROUPED].push(block.item.id);
      continue;
    }
    if (block.kind === 'projectGroupHeader' || block.kind === 'areaGroupHeader') {
      const id = block.kind === 'projectGroupHeader' ? block.project.id : block.area.id;
      containers[id] = [...block.taskIds];
      zoneOrder.push(id);
    }
  }
  return { zoneOrder, containers };
}

interface ParentMaps {
  kinds: Map<string, 'project' | 'area'>;
  titles: Map<string, string>;
  collapsed: Map<string, boolean>;
}

function parentMapsFromLayout(layout: GroupedFeedLayout): ParentMaps {
  const kinds = new Map<string, 'project' | 'area'>();
  const titles = new Map<string, string>();
  const collapsed = new Map<string, boolean>();
  for (const block of layout.blocks) {
    if (block.kind === 'projectGroupHeader') {
      kinds.set(block.project.id, 'project');
      titles.set(block.project.id, block.project.title);
      collapsed.set(block.project.id, block.collapsed);
    } else if (block.kind === 'areaGroupHeader') {
      kinds.set(block.area.id, 'area');
      titles.set(block.area.id, block.area.title);
      collapsed.set(block.area.id, block.collapsed);
    }
  }
  return { kinds, titles, collapsed };
}

/** 落点解析：任务行 → 其容器内 before/after；容器/组头 → 该组末尾。 */
export function resolveGroupedFeedPlacement(
  containers: Record<ContainerId, string[]>,
  overKey: string,
  edge: PlacementEdge,
): GroupedFeedPlacement | null {
  if (overKey.startsWith(TASK_DND_PREFIX)) {
    const overTaskId = overKey.slice(TASK_DND_PREFIX.length);
    const containerId = Object.keys(containers).find((id) =>
      containers[id].includes(overTaskId),
    );
    if (!containerId) return null;
    const overIndex = containers[containerId].indexOf(overTaskId);
    if (overIndex < 0) return null;
    return { containerId, index: overIndex + (edge === 'after' ? 1 : 0) };
  }
  // 组头行与容器空白同义：落到该组末尾。
  for (const prefix of [CONTAINER_DND_PREFIX, HEADER_DND_PREFIX]) {
    if (!overKey.startsWith(prefix)) continue;
    const containerId = overKey.slice(prefix.length);
    const target = containers[containerId];
    if (!target) return null;
    return { containerId, index: target.length };
  }
  return null;
}

/** 在容器集合内移动任务（跨容器 = 改归属，同容器 = 重排）；无变化返回 null。 */
export function moveGroupedFeedTask(
  containers: Record<ContainerId, string[]>,
  activeTaskId: string,
  placement: GroupedFeedPlacement,
): Record<ContainerId, string[]> | null {
  const sourceId = Object.keys(containers).find((id) =>
    containers[id].includes(activeTaskId),
  );
  const targetIds = containers[placement.containerId];
  if (!sourceId || !targetIds) return null;

  const sourceIds = containers[sourceId];
  const sourceIndex = sourceIds.indexOf(activeTaskId);
  let insertionIndex = Math.max(0, Math.min(placement.index, targetIds.length));
  if (sourceId === placement.containerId && sourceIndex < insertionIndex) {
    insertionIndex -= 1;
  }
  const maxIndexAfterRemoval =
    sourceId === placement.containerId ? targetIds.length - 1 : targetIds.length;
  insertionIndex = Math.min(insertionIndex, maxIndexAfterRemoval);
  if (sourceId === placement.containerId && sourceIndex === insertionIndex) return null;

  const next = Object.fromEntries(
    Object.entries(containers).map(([id, ids]) => [id, [...ids]]),
  );
  next[sourceId].splice(sourceIndex, 1);
  next[placement.containerId].splice(insertionIndex, 0, activeTaskId);
  return next;
}

function ordersEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

interface SortableFeedTaskProps {
  item: TaskFeedItem;
  projectTitle?: string;
  areaTitle?: string;
  selectionState: SelectionState;
  onToggleComplete: () => void;
  onRowClick: () => void;
}

function SortableFeedTask({
  item,
  projectTitle,
  areaTitle,
  selectionState,
  onToggleComplete,
  onRowClick,
}: SortableFeedTaskProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: taskDndId(item.id) });

  return (
    <div
      ref={setNodeRef}
      data-sortable-task-id={item.id}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
      tabIndex={-1}
    >
      <FeedItemRow
        item={item}
        projectTitle={projectTitle}
        areaTitle={areaTitle}
        selectionState={selectionState}
        onToggleComplete={onToggleComplete}
        onRowClick={onRowClick}
      />
    </div>
  );
}

/** 组头行的放置目标（Collapsed 组唯一的投放面；isOver 时给出来落点反馈）。 */
function GroupHeaderDropZone({
  parentId,
  children,
}: {
  parentId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: headerDndId(parentId) });
  return (
    <div
      ref={setNodeRef}
      data-group-header-dropzone={parentId}
      className={cn('rounded-lg', isOver && 'bg-accent/40')}
    >
      {children}
    </div>
  );
}

/** 一个分组的任务列表放置目标（含组内 SortableContext）。 */
function TaskContainerDropZone({
  containerId,
  taskIds,
  children,
}: {
  containerId: ContainerId;
  taskIds: string[];
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: containerDndId(containerId) });
  return (
    <SortableContext items={taskIds.map(taskDndId)} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} data-task-container={containerId} className="min-h-2 rounded-md">
        {children}
      </div>
    </SortableContext>
  );
}

/** 顶部未分组区的放置目标（未分组任务与独立项目行共享一个容器）。 */
function UngroupedDropZone({
  dragging,
  children,
}: {
  dragging: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: containerDndId(UNGROUPED) });
  return (
    <div
      ref={setNodeRef}
      data-task-container={UNGROUPED}
      className={cn('flex flex-col rounded-md', dragging && 'min-h-10')}
    >
      {children}
    </div>
  );
}

type RenderChunk =
  | { type: 'projectRow'; block: Extract<GroupedFeedBlock, { kind: 'projectRow' }> }
  | {
      type: 'header';
      block: Extract<
        GroupedFeedBlock,
        { kind: 'projectGroupHeader' | 'areaGroupHeader' }
      >;
    }
  | { type: 'tasks'; containerId: ContainerId; taskIds: string[] };

/**
 * Grouped View（分组视图）列表：今天/随时/将来三个时间视图按项目/领域
 * 聚类展示任务。分组为纯渲染层推导（deriveGroupedFeedLayout），折叠状态
 * 设备本地记忆；组内拖拽重排写回全局 Position，跨组拖拽改任务归属，
 * 组头不可拖拽（组间顺序由侧边栏持有）。
 */
export function GroupedFeedListView({ view, items, emptyHint }: Props) {
  const { t } = useTranslation();
  const { handleRowClick, handleBlankClick, selectedIds, expandedId } =
    useTaskRowSelection();
  const setSelection = useSelectionStore((s) => s.setSelection);
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const collapsedAll = useGroupedViewCollapseStore((s) => s.collapsed);
  const setCollapsed = useGroupedViewCollapseStore((s) => s.setCollapsed);
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const reorderTasks = useReorderTasks();
  const updateTask = useUpdateTask();

  // 折叠状态按 `{view}:{parentId}` 存储；推导只消费本视图的 parentId 切片。
  const viewCollapsed = React.useMemo(() => {
    const prefix = `${view}:`;
    const slice: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(collapsedAll)) {
      if (value && key.startsWith(prefix)) slice[key.slice(prefix.length)] = true;
    }
    return slice;
  }, [collapsedAll, view]);

  const layout = React.useMemo(
    () =>
      deriveGroupedFeedLayout({
        items,
        projects,
        areas,
        collapsed: viewCollapsed,
        groupingEnabled: true,
      }),
    [items, projects, areas, viewCollapsed],
  );

  // 注册当前可见行（ADR-0004）：折叠组只贡献组头行，j/k 不会困进隐藏任务；
  // 组头行携带 groupHeader 元数据供 ←/→ 折叠与「下方新建」预填父级。
  const rows = React.useMemo<SelectionRow[]>(
    () =>
      layout.blocks.map((block): SelectionRow => {
        switch (block.kind) {
          case 'task':
            return {
              id: block.item.id,
              kind: 'task',
              completed: block.item.status === 'COMPLETED',
              cancelled: block.item.status === 'CANCELLED',
              groupHeaderId: block.groupHeaderId ?? undefined,
            };
          case 'projectRow':
            return { id: block.item.id, kind: 'project' };
          case 'projectGroupHeader':
            return {
              id: block.project.id,
              kind: 'project',
              groupHeaderId: block.project.id,
              groupHeader: {
                collapsed: block.collapsed,
                createContext: { projectId: block.project.id },
              },
            };
          case 'areaGroupHeader':
            return {
              id: block.area.id,
              kind: 'area',
              groupHeaderId: block.area.id,
              groupHeader: {
                collapsed: block.collapsed,
                createContext: { areaId: block.area.id },
              },
            };
        }
      }),
    [layout],
  );
  useSelectionScope(rows);

  // 选中行所在组被折叠时，Selection 移到接管它的组头（story 26），
  // 保证 Selection 永不落在不可见行上。
  React.useEffect(() => {
    if (selectedIds.length === 0) return;
    const visible = new Set(rows.map((row) => row.id));
    let changed = false;
    const next: string[] = [];
    for (const id of selectedIds) {
      if (visible.has(id)) {
        next.push(id);
        continue;
      }
      const fallback = layout.selectionFallback[id];
      if (fallback) {
        if (!next.includes(fallback)) next.push(fallback);
        changed = true;
      } else if (!next.includes(id)) {
        next.push(id);
      }
    }
    if (changed) setSelection(next);
  }, [layout, rows, selectedIds, setSelection]);

  const projectMap = React.useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );
  const areaMap = React.useMemo(
    () => Object.fromEntries(areas.map((a) => [a.id, a.title])),
    [areas],
  );
  const itemMap = React.useMemo(
    () =>
      new Map(
        items.filter((i): i is TaskFeedItem => i.type === 'task').map((i) => [i.id, i]),
      ),
    [items],
  );

  const [activeTask, setActiveTask] = React.useState<TaskFeedItem | null>(null);
  const lastTargetRef = React.useRef<{ overKey: string; edge: PlacementEdge } | null>(
    null,
  );

  const { zoneOrder, containers } = React.useMemo(
    () => containersFromLayout(layout),
    [layout],
  );
  const parentMaps = React.useMemo(() => parentMapsFromLayout(layout), [layout]);

  // 鼠标：移动 5px 激活；触摸：按住 300ms 再移动才激活，避免与列表滚动冲突。
  // 不挂 KeyboardSensor：组头不可拖拽，行内 Enter/Space 属于全局键位。
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const activeKey = String(args.active.id);
    if (!activeKey.startsWith(TASK_DND_PREFIX)) return [];
    const compatible = args.droppableContainers.filter((container) => {
      const id = String(container.id);
      return (
        id.startsWith(TASK_DND_PREFIX) ||
        id.startsWith(CONTAINER_DND_PREFIX) ||
        id.startsWith(HEADER_DND_PREFIX)
      );
    });
    const collisions = args.pointerCoordinates
      ? pointerWithin({ ...args, droppableContainers: compatible })
      : closestCenter({ ...args, droppableContainers: compatible });
    if (collisions.length === 0) return [];

    // 优先最具体的落点：任务行 > 组头 > 容器空白。
    const collision = args.pointerCoordinates
      ? (collisions.find(({ id }) => String(id).startsWith(TASK_DND_PREFIX)) ??
        collisions.find(({ id }) => String(id).startsWith(HEADER_DND_PREFIX)) ??
        collisions.find(({ id }) => String(id).startsWith(CONTAINER_DND_PREFIX)))
      : collisions[0];
    if (!collision) return [];

    const overKey = String(collision.id);
    let edge: PlacementEdge = 'before';
    if (overKey.startsWith(TASK_DND_PREFIX)) {
      const rect = args.droppableRects.get(collision.id);
      if (args.pointerCoordinates && rect) {
        edge = args.pointerCoordinates.y >= rect.top + rect.height / 2 ? 'after' : 'before';
      }
    }
    lastTargetRef.current = { overKey, edge };
    return [collision];
  }, []);

  if (items.length === 0) {
    return <FeedEmptyHint hint={emptyHint ?? t('task:empty')} />;
  }

  const handleToggle = (item: TaskFeedItem) => {
    if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
    else {
      completeTask.mutate(item.id, {
        onError: () => toast.error(t('common:operationFailed')),
      });
    }
  };

  const toggleGroup = (parentId: string, collapsed: boolean) => {
    setCollapsed(view, parentId, collapsed);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const activeKey = String(active.id);
    if (!activeKey.startsWith(TASK_DND_PREFIX)) return;
    const taskId = activeKey.slice(TASK_DND_PREFIX.length);
    const item = itemMap.get(taskId);
    if (!item) return;

    const focused = document.activeElement as HTMLElement | null;
    const sortableTask = focused?.closest<HTMLElement>('[data-sortable-task-id]');
    if (sortableTask?.dataset.sortableTaskId === taskId) focused?.blur();
    handleBlankClick();

    lastTargetRef.current = null;
    setActiveTask(item);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const activeKey = String(active.id);
    setActiveTask(null);
    if (!activeKey.startsWith(TASK_DND_PREFIX)) return;
    const taskId = activeKey.slice(TASK_DND_PREFIX.length);
    if (!over) {
      lastTargetRef.current = null;
      return;
    }
    const overKey = String(over.id);
    const edge =
      lastTargetRef.current?.overKey === overKey ? lastTargetRef.current.edge : 'before';
    lastTargetRef.current = null;

    const placement = resolveGroupedFeedPlacement(containers, overKey, edge);
    if (!placement) return;
    const fromContainer = Object.keys(containers).find((id) =>
      containers[id].includes(taskId),
    );
    if (!fromContainer) return;

    const next = moveGroupedFeedTask(containers, taskId, placement);
    const finalContainers = next ?? containers;
    const finalOrder = zoneOrder.flatMap((zone) => finalContainers[zone] ?? []);
    const orderChanged = !ordersEqual(finalOrder, layout.taskOrder);

    if (placement.containerId !== fromContainer) {
      // 跨组 = 改归属（headingId 由数据层随 projectId 变化自动清除），
      // 并把任务写回到落点对应的全局位次。
      const data = reassignmentDto(placement.containerId, parentMaps);
      if (!data) return;
      updateTask.mutate({ id: taskId, data });
      if (orderChanged) reorderTasks.mutate(finalOrder);
      // 投向折叠组：任务落在组末尾，toast 给出明确反馈（story 20）。
      if (parentMaps.collapsed.get(placement.containerId)) {
        toast.success(
          t('task:movedToGroup', {
            title: parentMaps.titles.get(placement.containerId) ?? '',
          }),
        );
      }
      return;
    }

    // 同组 = 组内重排，写回全局 Position（与平铺 sortable 路径一致）。
    if (orderChanged) reorderTasks.mutate(finalOrder);
  };

  const handleDragCancel = () => {
    lastTargetRef.current = null;
    setActiveTask(null);
  };

  // 渲染序列切块：连续同容器任务合并为一个容器块；顶部未分组区与分组块
  // 依次排列（Area 组内可再嵌套项目子组块）。
  const chunks: RenderChunk[] = [];
  for (const block of layout.blocks) {
    if (block.kind === 'task') {
      const containerId = block.groupHeaderId ?? UNGROUPED;
      const last = chunks[chunks.length - 1];
      if (last?.type === 'tasks' && last.containerId === containerId) {
        last.taskIds.push(block.item.id);
      } else {
        chunks.push({ type: 'tasks', containerId, taskIds: [block.item.id] });
      }
    } else if (block.kind === 'projectRow') {
      chunks.push({ type: 'projectRow', block });
    } else {
      chunks.push({ type: 'header', block });
    }
  }
  const firstHeaderIndex = chunks.findIndex((chunk) => chunk.type === 'header');
  const topChunks = firstHeaderIndex === -1 ? chunks : chunks.slice(0, firstHeaderIndex);
  const groupChunks = firstHeaderIndex === -1 ? [] : chunks.slice(firstHeaderIndex);

  const renderTask = (containerId: ContainerId) => (taskId: string) => {
    const item = itemMap.get(taskId);
    if (!item) return null;
    // 孤儿任务在未分组区保留项目/领域标题标签（story 27）；组内任务的
    // 归属已由组头表达，不再重复标签。
    const ungrouped = containerId === UNGROUPED;
    return (
      <SortableFeedTask
        key={taskId}
        item={item}
        projectTitle={ungrouped && item.projectId ? projectMap[item.projectId] : undefined}
        areaTitle={ungrouped && item.areaId ? areaMap[item.areaId] : undefined}
        selectionState={selectionStateOf(selectedIds, expandedId, taskId)}
        onToggleComplete={() => handleToggle(item)}
        onRowClick={() => handleRowClick(taskId)}
      />
    );
  };

  const renderHeader = (
    block: Extract<GroupedFeedBlock, { kind: 'projectGroupHeader' | 'areaGroupHeader' }>,
  ) => {
    if (block.kind === 'projectGroupHeader') {
      return (
        <ProjectGroupHeaderRow
          project={block.project}
          collapsed={block.collapsed}
          onToggleCollapse={() => toggleGroup(block.project.id, !block.collapsed)}
          selectionState={selectionStateOf(selectedIds, expandedId, block.project.id)}
        />
      );
    }
    return (
      <AreaGroupHeaderRow
        area={block.area}
        directTaskCount={block.directTaskCount}
        collapsed={block.collapsed}
        onToggleCollapse={() => toggleGroup(block.area.id, !block.collapsed)}
        selectionState={selectionStateOf(selectedIds, expandedId, block.area.id)}
      />
    );
  };

  return (
    <div className="flex flex-col" onClick={handleBlankClick}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* 顶部未分组区：未分组任务与独立项目行按合并 feed 顺序交错。
            拖拽期间即使为空也保留投放面（移出项目 = 拖到此处）。 */}
        {(topChunks.length > 0 || activeTask) && (
          <UngroupedDropZone dragging={activeTask !== null}>
            {topChunks.map((chunk, index) => {
              if (chunk.type === 'projectRow') {
                const item = chunk.block.item;
                return (
                  <FeedItemRow
                    key={item.id}
                    item={item}
                    selectionState={selectionStateOf(selectedIds, expandedId, item.id)}
                  />
                );
              }
              if (chunk.type !== 'tasks') return null;
              return (
                <SortableContext
                  key={`${UNGROUPED}:${index}`}
                  items={chunk.taskIds.map(taskDndId)}
                  strategy={verticalListSortingStrategy}
                >
                  {chunk.taskIds.map(renderTask(UNGROUPED))}
                </SortableContext>
              );
            })}
          </UngroupedDropZone>
        )}

        {groupChunks.map((chunk, index) => {
          if (chunk.type === 'header') {
            const parentId =
              chunk.block.kind === 'projectGroupHeader'
                ? chunk.block.project.id
                : chunk.block.area.id;
            return (
              <GroupHeaderDropZone key={parentId} parentId={parentId}>
                {renderHeader(chunk.block)}
              </GroupHeaderDropZone>
            );
          }
          if (chunk.type !== 'tasks') return null;
          return (
            <TaskContainerDropZone
              key={`${chunk.containerId}:${index}`}
              containerId={chunk.containerId}
              taskIds={chunk.taskIds}
            >
              {chunk.taskIds.map(renderTask(chunk.containerId))}
            </TaskContainerDropZone>
          );
        })}

        <DragOverlay>
          {activeTask ? (
            <div
              className="pointer-events-none w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/70 bg-card shadow-lift"
              aria-hidden="true"
              {...{ inert: '' }}
            >
              <FeedItemRow item={activeTask} selectionState="idle" />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/** 跨组落点 → 归属变更 DTO（headingId 由数据层随 projectId 变化清除）。 */
function reassignmentDto(
  containerId: ContainerId,
  maps: ParentMaps,
): UpdateTaskDto | null {
  if (containerId === UNGROUPED) return { projectId: null, areaId: null };
  const kind = maps.kinds.get(containerId);
  if (kind === 'project') return { projectId: containerId, areaId: null };
  if (kind === 'area') return { projectId: null, areaId: containerId };
  return null;
}
