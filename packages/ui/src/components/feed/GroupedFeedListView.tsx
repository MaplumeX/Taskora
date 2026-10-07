import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { toast } from 'sonner';

import type {
  FeedItem,
  FeedOrderItem,
  TaskFeedItem,
  UpdateTaskDto,
} from '@taskora/shared';

import { cn } from '@/lib/utils';
import {
  dndListProps,
  dragOverlayClass,
  dropAnimation,
  flipId,
  noopSortingStrategy,
  useFlipList,
  useHeldValue,
} from '../../lib/dnd';
import { FeedItemRow } from './FeedItemRow';
import { SortableFeedRow } from './SortableFeedRow';
import { EmptyState } from '@/components/common/EmptyState';
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
  useProjectsQuery,
  useReorderFeed,
  useSelectionScope,
  useTaskRowSelection,
  useUncompleteTask,
  useUpdateTask,
  type SelectionRow,
} from '@taskora/api';

interface Props {
  items: FeedItem[];
  emptyHint?: string;
  /** 视图本身已表达日期语境时传 false（如 Today），省略行首日期 chip。 */
  showScheduledBadge?: boolean;
  /**
   * 是否按项目/领域分组（默认 true）。关闭时为平铺列表：全部任务在
   * 未分组区、与独立项目行按 feed 顺序交错，拖拽只重排、不改归属。
   */
  grouping?: boolean;
  /**
   * New in Today 新到条目的键（`task:<id>` / `project:<id>`）：置顶于新到区、
   * 行首带黄点。新到区只能区内重排，其他行不能拖入、新到行也不能拖出。
   */
  freshKeys?: ReadonlySet<string>;
}

const UNGROUPED = 'ungrouped';
/** 新到区（New in Today）的容器 id。 */
const FRESH = 'fresh';
type ContainerId = typeof UNGROUPED | typeof FRESH | string;

const TASK_DND_PREFIX = 'task:';
const CONTAINER_DND_PREFIX = 'container:';
const HEADER_DND_PREFIX = 'header:';
/** 独立项目行（顶部未分组区，非组头）。 */
const PROJECT_ROW_DND_PREFIX = 'project:';

type PlacementEdge = 'before' | 'after';

export function taskDndId(id: string) {
  return `${TASK_DND_PREFIX}${id}`;
}

export function containerDndId(id: ContainerId) {
  return `${CONTAINER_DND_PREFIX}${id}`;
}

export function headerDndId(id: string) {
  return `${HEADER_DND_PREFIX}${id}`;
}

export function projectRowDndId(id: string) {
  return `${PROJECT_ROW_DND_PREFIX}${id}`;
}

type FeedDragTarget = { overKey: string; edge: PlacementEdge };

interface ParentMaps {
  kinds: Map<string, 'project' | 'area'>;
}

function parentMapsFromLayout(layout: GroupedFeedLayout): ParentMaps {
  const kinds = new Map<string, 'project' | 'area'>();
  for (const block of layout.blocks) {
    if (block.kind === 'projectGroupHeader') {
      kinds.set(block.project.id, 'project');
    } else if (block.kind === 'areaGroupHeader') {
      kinds.set(block.area.id, 'area');
    }
  }
  return { kinds };
}

/** 推导结果中每个任务所在的容器（组头 id；新到区 FRESH；顶部未分组区 UNGROUPED）。 */
export function taskContainersOf(layout: GroupedFeedLayout): Map<string, ContainerId> {
  const containers = new Map<string, ContainerId>();
  for (const block of layout.blocks) {
    if (block.kind === 'task') {
      containers.set(block.item.id, block.fresh ? FRESH : (block.groupHeaderId ?? UNGROUPED));
    }
  }
  return containers;
}

/** 行所在的容器：任务按推导结果；独立项目行在新到区或顶部未分组区。 */
function rowContainerOf(
  layout: GroupedFeedLayout,
  item: Pick<FeedItem, 'type' | 'id'>,
): ContainerId | undefined {
  if (item.type === 'task') return taskContainersOf(layout).get(item.id);
  const fresh = layout.blocks.some(
    (block) => block.kind === 'projectRow' && block.fresh && block.item.id === item.id,
  );
  return fresh ? FRESH : UNGROUPED;
}

/** 新到区 / 顶部未分组区的行（按显示顺序）。 */
function topRowsOf(layout: GroupedFeedLayout, fresh: boolean): FeedItem[] {
  return layout.blocks.flatMap((block): FeedItem[] => {
    if (block.kind === 'projectRow' && !!block.fresh === fresh) return [block.item];
    if (block.kind === 'task' && block.groupHeaderId === null && !!block.fresh === fresh) {
      return [block.item];
    }
    return [];
  });
}

/** feed 项的 dnd id：任务行与独立项目行（顶部未分组区）。 */
export function feedItemDndId(item: Pick<FeedItem, 'type' | 'id'>) {
  return item.type === 'task' ? taskDndId(item.id) : projectRowDndId(item.id);
}

/**
 * 可排序行的显示顺序：任务行与独立项目行（被组头吸收的项目不在其中），
 * 即 feed 重排写回的顺序。
 */
export function feedOrderOf(layout: GroupedFeedLayout): FeedOrderItem[] {
  return layout.blocks.flatMap((block): FeedOrderItem[] => {
    if (block.kind === 'task') return [{ type: 'task', id: block.item.id }];
    if (block.kind === 'projectRow') return [{ type: 'project', id: block.item.id }];
    return [];
  });
}

function sameFeedItem(item: FeedItem, ref: Pick<FeedItem, 'type' | 'id'>) {
  return item.type === ref.type && item.id === ref.id;
}

/**
 * 实时预览 / 落点：把被拖的行移到目标处，返回新的 feed 项数组（无变化返回 null）。
 *
 * - 任务行 / 独立项目行 → 插到该行之前/之后（edge）；任务的归属随目标所在组；
 * - 组头 / 组容器 → 该组末尾；顶部未分组区空白 → 未分组区末尾。
 * - 独立项目行只能在顶部未分组区内移动（它不属于任何组），越界目标不生效。
 * - 新到区（New in Today）自成一区：新到行只在区内重排、不改归属，其他行
 *   也不能拖入。
 *
 * 组内顺序与未分组区顺序都跟随 feed 项数组顺序（deriveGroupedFeedLayout），
 * 因此只需在数组内挪位并改写归属字段。任务回到原组时恢复拖拽开始时的原
 * 字段（孤儿任务留在未分组区不会被清掉项目归属）。
 */
export function moveFeedItemToTarget(
  items: FeedItem[],
  layout: GroupedFeedLayout,
  origin: { item: FeedItem; container: ContainerId },
  target: FeedDragTarget,
): FeedItem[] | null {
  const active = origin.item;
  const containers = taskContainersOf(layout);
  const lastIn = (containerId: ContainerId): Pick<FeedItem, 'type' | 'id'> | null => {
    const rows =
      containerId === UNGROUPED || containerId === FRESH
        ? topRowsOf(layout, containerId === FRESH)
        : [...containers]
            .filter(([, id]) => id === containerId)
            .map(([id]) => ({ type: 'task' as const, id }));
    const others = rows.filter((row) => !sameFeedItem(active, row));
    return others[others.length - 1] ?? null;
  };

  let targetContainer: ContainerId;
  let anchor: Pick<FeedItem, 'type' | 'id'> | null;
  let after: boolean;
  const { overKey, edge } = target;
  if (overKey.startsWith(TASK_DND_PREFIX) || overKey.startsWith(PROJECT_ROW_DND_PREFIX)) {
    const isTask = overKey.startsWith(TASK_DND_PREFIX);
    const over = {
      type: isTask ? ('task' as const) : ('project' as const),
      id: overKey.slice((isTask ? TASK_DND_PREFIX : PROJECT_ROW_DND_PREFIX).length),
    };
    const overContainer = rowContainerOf(layout, over);
    if (sameFeedItem(active, over) || overContainer === undefined) return null;
    targetContainer = overContainer;
    anchor = over;
    after = edge === 'after';
  } else if (overKey.startsWith(HEADER_DND_PREFIX) || overKey.startsWith(CONTAINER_DND_PREFIX)) {
    const prefix = overKey.startsWith(HEADER_DND_PREFIX) ? HEADER_DND_PREFIX : CONTAINER_DND_PREFIX;
    targetContainer = overKey.slice(prefix.length);
    if (
      targetContainer !== UNGROUPED &&
      targetContainer !== FRESH &&
      !parentMapsFromLayout(layout).kinds.has(targetContainer)
    ) {
      return null;
    }
    anchor = lastIn(targetContainer);
    after = true;
  } else {
    return null;
  }
  if ((origin.container === FRESH) !== (targetContainer === FRESH)) return null;
  if (active.type === 'project' && targetContainer !== UNGROUPED && targetContainer !== FRESH) {
    return null;
  }

  let moved: FeedItem = active;
  if (active.type === 'task' && targetContainer !== origin.container) {
    const data = reassignmentDto(targetContainer, parentMapsFromLayout(layout));
    if (!data) return null;
    moved = { ...active, projectId: data.projectId ?? null, areaId: data.areaId ?? null };
  }

  const rest = items.filter((item) => !sameFeedItem(item, active));
  let index: number;
  if (anchor !== null) {
    const anchorRef = anchor;
    const anchorIndex = rest.findIndex((item) => sameFeedItem(item, anchorRef));
    if (anchorIndex < 0) return null;
    index = anchorIndex + (after ? 1 : 0);
  } else {
    // 目标区内没有其它行：组的位置由侧边栏顺序决定，数组内位置无关紧要；
    // 未分组区则放到最前，紧贴顶部投放面。
    index = targetContainer === UNGROUPED ? 0 : rest.length;
  }
  const next = [...rest.slice(0, index), moved, ...rest.slice(index)];

  const current = items.find((item) => sameFeedItem(item, active));
  const unchanged =
    current !== undefined &&
    (current.type !== 'task' ||
      moved.type !== 'task' ||
      (current.projectId === moved.projectId && current.areaId === moved.areaId)) &&
    next.every((item, i) => items[i] !== undefined && sameFeedItem(item, items[i]));
  return unchanged ? null : next;
}

function feedOrderKey(order: FeedOrderItem[]) {
  return order.map((item) => `${item.type}:${item.id}`).join('|');
}

/** 显示顺序 + 任务归属的签名（松手后的本地结果是否已被 props 追上）。 */
function feedSignature(layout: GroupedFeedLayout) {
  const containers = taskContainersOf(layout);
  return feedOrderOf(layout)
    .map((item) =>
      item.type === 'task' ? `task:${item.id}@${containers.get(item.id)}` : `project:${item.id}`,
    )
    .join('|');
}

function isRowKey(key: string) {
  return key.startsWith(TASK_DND_PREFIX) || key.startsWith(PROJECT_ROW_DND_PREFIX);
}

/** 组头行的放置目标（投向组头 = 落在该组末尾）。
 *  同时承载组间间隔：mt-6 开新的一块，首个组头（first）无额外间距。 */
function GroupHeaderDropZone({
  parentId,
  children,
}: {
  parentId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: headerDndId(parentId) });
  return (
    <div
      ref={setNodeRef}
      data-group-header-dropzone={parentId}
      {...flipId(headerDndId(parentId))}
      className="mt-6 rounded-lg first:mt-0"
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
    <SortableContext items={taskIds.map(taskDndId)} strategy={noopSortingStrategy}>
      <div ref={setNodeRef} data-task-container={containerId} className="min-h-2 rounded-md">
        {children}
      </div>
    </SortableContext>
  );
}

/**
 * 顶部未分组区的放置目标（未分组任务与独立项目行共享一个容器）。
 * floating：未分组区为空时的拖拽投放面——浮在列表上方、不占文档流，
 * 拖拽开始时不会把整列往下推出一块空白。
 */
function UngroupedDropZone({
  containerId = UNGROUPED,
  floating = false,
  children,
}: {
  /** 顶部未分组区，或同形的新到区（FRESH）。 */
  containerId?: typeof UNGROUPED | typeof FRESH;
  floating?: boolean;
  children?: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: containerDndId(containerId) });
  return (
    <div
      ref={setNodeRef}
      data-task-container={containerId}
      className={cn(
        'flex flex-col rounded-md',
        floating && 'absolute inset-x-0 bottom-full h-10',
      )}
    >
      {children}
    </div>
  );
}

type GroupChunk =
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
 * 聚类展示任务。分组为纯渲染层推导（deriveGroupedFeedLayout），扁平单层、
 * 不可折叠；组内拖拽重排写回全局 Position，跨组拖拽改任务归属，组头不
 * 可拖拽（组间顺序由侧边栏持有）。顶部未分组区的独立项目行可与任务一起
 * 拖拽排序，写回项目的 Feed Position（不影响侧边栏顺序）。
 *
 * 拖拽为实时预览：拖拽中在本地 feed 项副本上挪位（含跨组改归属）并重新
 * 推导分组，空位即落点；松手后本地结果保留到乐观更新追上（lib/dnd.ts）。
 * grouping=false 时同一套渲染与拖拽用于平铺时间视图。
 */
export function GroupedFeedListView({
  items,
  emptyHint,
  showScheduledBadge,
  grouping = true,
  freshKeys,
}: Props) {
  const { t } = useTranslation();
  const { handleRowClick, handleBlankClick, selectedIds, expandedId } =
    useTaskRowSelection();
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const reorderFeed = useReorderFeed();
  const updateTask = useUpdateTask();

  const derive = (list: FeedItem[], retainGroupIds?: ReadonlySet<string>) =>
    deriveGroupedFeedLayout({
      items: list,
      projects,
      areas,
      groupingEnabled: grouping,
      retainGroupIds,
      freshKeys,
    });

  // 松手后的本地结果：显示顺序与任务归属追上之前一直以它渲染。
  const [shownItems, holdItems] = useHeldValue(items, (list) => feedSignature(derive(list)));
  const [drag, setDrag] = React.useState<{
    origin: { item: FeedItem; container: ContainerId };
    items: FeedItem[];
  } | null>(null);
  const dragRef = React.useRef(drag);
  const lastTargetRef = React.useRef<FeedDragTarget | null>(null);

  const viewItems = drag?.items ?? shownItems;
  const retainGroupIds = React.useMemo(
    () =>
      drag && drag.origin.container !== UNGROUPED && drag.origin.container !== FRESH
        ? new Set([drag.origin.container])
        : undefined,
    [drag],
  );
  const layout = React.useMemo(
    () => derive(viewItems, retainGroupIds),
    // derive 只依赖 projects / areas / grouping / freshKeys
    [viewItems, retainGroupIds, projects, areas, grouping, freshKeys],
  );
  const flip = useFlipList<HTMLDivElement>(layout);

  // 注册当前可见行（ADR-0004）：组头行携带 groupHeader 元数据供「下方新建」
  // 预填父级与 Alt+↑/↓ 组边界钳制；所有行始终可见。
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
              tagIds: block.item.tags.map((tag) => tag.id),
              groupHeaderId: block.groupHeaderId ?? undefined,
            };
          case 'projectRow':
            return {
              id: block.item.id,
              kind: 'project',
              tagIds: block.item.tags.map((tag) => tag.id),
            };
          case 'projectGroupHeader':
            return {
              id: block.project.id,
              kind: 'project',
              groupHeaderId: block.project.id,
              groupHeader: { createContext: { projectId: block.project.id } },
            };
          case 'areaGroupHeader':
            return {
              id: block.area.id,
              kind: 'area',
              groupHeaderId: block.area.id,
              groupHeader: { createContext: { areaId: block.area.id } },
            };
        }
      }),
    [layout],
  );
  useSelectionScope(rows);

  const projectMap = React.useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );
  const areaMap = React.useMemo(
    () => Object.fromEntries(areas.map((a) => [a.id, a.title])),
    [areas],
  );
  // dnd id → 行（任务与独立项目行）。
  const rowMap = React.useMemo(
    () => new Map(viewItems.map((item) => [feedItemDndId(item), item])),
    [viewItems],
  );

  // 鼠标：移动 5px 激活；触摸：按住 300ms 再移动才激活，避免与列表滚动冲突。
  // 不挂 KeyboardSensor：组头不可拖拽，行内 Enter/Space 属于全局键位。
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const activeKey = String(args.active.id);
    if (!isRowKey(activeKey)) return [];
    const compatible = args.droppableContainers.filter((container) => {
      const id = String(container.id);
      return (
        isRowKey(id) || id.startsWith(CONTAINER_DND_PREFIX) || id.startsWith(HEADER_DND_PREFIX)
      );
    });
    const collisions = args.pointerCoordinates
      ? pointerWithin({ ...args, droppableContainers: compatible })
      : closestCenter({ ...args, droppableContainers: compatible });
    if (collisions.length === 0) return [];

    // 优先最具体的落点：任务 / 项目行（含被拖行自己的空位）> 组头 > 容器空白。
    const collision = args.pointerCoordinates
      ? (collisions.find(({ id }) => isRowKey(String(id))) ??
        collisions.find(({ id }) => String(id).startsWith(HEADER_DND_PREFIX)) ??
        collisions.find(({ id }) => String(id).startsWith(CONTAINER_DND_PREFIX)))
      : collisions[0];
    if (!collision) return [];

    const overKey = String(collision.id);
    let edge: PlacementEdge = 'before';
    if (isRowKey(overKey)) {
      const rect = args.droppableRects.get(collision.id);
      if (args.pointerCoordinates && rect) {
        edge = args.pointerCoordinates.y >= rect.top + rect.height / 2 ? 'after' : 'before';
      }
    }
    lastTargetRef.current = { overKey, edge };
    return [collision];
  }, []);

  if (items.length === 0 && !drag) {
    return <EmptyState hint={emptyHint ?? t('task:empty')} />;
  }

  const handleToggle = (item: TaskFeedItem) => {
    if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
    else {
      completeTask.mutate(item.id, {
        onError: () => toast.error(t('common:operationFailed')),
      });
    }
  };

  const updateDrag = (next: typeof drag) => {
    dragRef.current = next;
    setDrag(next);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const item = rowMap.get(String(active.id));
    if (!item) return;
    const container = rowContainerOf(layout, item);
    if (container === undefined) return;

    const focused = document.activeElement as HTMLElement | null;
    const sortableTask = focused?.closest<HTMLElement>('[data-sortable-task-id]');
    if (sortableTask?.dataset.sortableTaskId === item.id) focused?.blur();
    handleBlankClick();

    lastTargetRef.current = null;
    updateDrag({ origin: { item, container }, items: viewItems });
  };

  /** 把当前碰撞目标应用到拖拽副本上；返回应用后的 feed 项。 */
  const applyTarget = (target: FeedDragTarget | null) => {
    const current = dragRef.current;
    if (!current || !target) return current?.items ?? null;
    const retain =
      current.origin.container !== UNGROUPED && current.origin.container !== FRESH
        ? new Set([current.origin.container])
        : undefined;
    const next = moveFeedItemToTarget(
      current.items,
      derive(current.items, retain),
      current.origin,
      target,
    );
    return next ?? current.items;
  };

  const previewTarget = (activeKey: string) => {
    const current = dragRef.current;
    if (!current || activeKey !== feedItemDndId(current.origin.item)) return;
    const next = applyTarget(lastTargetRef.current);
    if (!next || next === current.items) return;
    flip.capture();
    updateDrag({ ...current, items: next });
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const overKey = String(over.id);
    if (lastTargetRef.current?.overKey !== overKey) {
      lastTargetRef.current = { overKey, edge: 'before' };
    }
    previewTarget(String(active.id));
  };

  // dnd-kit 只在 over.id 变化时触发 onDragOver；同一行内越过中线要靠每次
  // 指针移动重读碰撞检测记下的 edge。
  const handleDragMove = ({ active }: DragMoveEvent) => {
    previewTarget(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const current = dragRef.current;
    const target: FeedDragTarget | null = over
      ? {
          overKey: String(over.id),
          edge:
            lastTargetRef.current?.overKey === String(over.id)
              ? lastTargetRef.current.edge
              : 'before',
        }
      : null;
    // 松手 = 落在最后一次预览处（拖出列表外也保留最后的有效预览）。
    const finalItems = applyTarget(target);
    lastTargetRef.current = null;
    updateDrag(null);
    if (!current || !finalItems || String(active.id) !== feedItemDndId(current.origin.item)) {
      return;
    }

    const moved = current.origin.item;
    const before = derive(items);
    const after = derive(finalItems);
    const beforeOrder = feedOrderOf(before);
    const afterOrder = feedOrderOf(after);
    const orderChanged = feedOrderKey(afterOrder) !== feedOrderKey(beforeOrder);
    let data: UpdateTaskDto | null = null;
    if (moved.type === 'task') {
      const fromContainer = taskContainersOf(before).get(moved.id);
      const toContainer = taskContainersOf(after).get(moved.id);
      if (fromContainer === undefined || toContainer === undefined) return;
      if (toContainer !== fromContainer) {
        data = reassignmentDto(toContainer, parentMapsFromLayout(after));
        if (!data) return;
      }
    }
    if (!orderChanged && !data) return;

    holdItems(finalItems);
    // 跨组 = 改归属（headingId 由数据层随 projectId 变化自动清除）；顺序按
    // 显示顺序写回：任务写 Position，独立项目行写 Feed Position。跨组时
    // 即使显示顺序没变也要写：分组时组内任务总排在顶部区之后、与其位次
    // 无关，进入顶部区后才按真实位次排（repositionFeed 已在序则不写）。
    if (data) updateTask.mutate({ id: moved.id, data });
    if (orderChanged || data) reorderFeed.mutate(afterOrder);
  };

  const handleDragCancel = () => {
    lastTargetRef.current = null;
    updateDrag(null);
  };

  const activeItem = drag?.origin.item ?? null;
  // 跨组预览会改写归属字段，浮层跟随当前预览中的那一行。
  const overlayItem = activeItem ? rowMap.get(feedItemDndId(activeItem)) ?? activeItem : null;

  // 新到区置顶；顶部未分组区：未分组任务与独立项目行按 feed 顺序交错，
  // 同属一个可排序容器。其后是扁平单层的分组：组头 + 组内任务。
  const freshRows = topRowsOf(layout, true);
  const topRows = topRowsOf(layout, false);
  const groupChunks: GroupChunk[] = [];
  for (const block of layout.blocks) {
    if (block.kind === 'projectGroupHeader' || block.kind === 'areaGroupHeader') {
      groupChunks.push({ type: 'header', block });
    } else if (block.kind === 'task' && block.groupHeaderId !== null) {
      const last = groupChunks[groupChunks.length - 1];
      if (last?.type === 'tasks' && last.containerId === block.groupHeaderId) {
        last.taskIds.push(block.item.id);
      } else {
        groupChunks.push({ type: 'tasks', containerId: block.groupHeaderId, taskIds: [block.item.id] });
      }
    }
  }

  // 孤儿任务在未分组区保留项目/领域标题标签；组内任务的归属已由组头
  // 表达，不再重复标签。列表行与拖拽浮层共用，保证拖起来的就是那一行。
  const rowLabels = (item: FeedItem, containerId: ContainerId | undefined) => {
    const ungrouped = containerId === UNGROUPED || containerId === FRESH;
    if (item.type !== 'task') return {};
    return {
      projectTitle: ungrouped && item.projectId ? projectMap[item.projectId] : undefined,
      areaTitle: ungrouped && item.areaId ? areaMap[item.areaId] : undefined,
    };
  };

  const renderRow = (item: FeedItem, containerId: ContainerId) => {
    const dndId = feedItemDndId(item);
    return (
      <SortableFeedRow
        key={dndId}
        dndId={dndId}
        item={item}
        placeholder={activeItem !== null && feedItemDndId(activeItem) === dndId}
        {...rowLabels(item, containerId)}
        hidePlacement={grouping}
        selectionState={selectionStateOf(selectedIds, expandedId, item.id)}
        showScheduledBadge={showScheduledBadge}
        newInToday={containerId === FRESH}
        {...(item.type === 'task'
          ? {
              onToggleComplete: () => handleToggle(item),
              onRowClick: () => handleRowClick(item.id),
            }
          : {})}
      />
    );
  };

  const renderTask = (containerId: ContainerId) => (taskId: string) => {
    const item = rowMap.get(taskDndId(taskId));
    return item ? renderRow(item, containerId) : null;
  };

  const renderHeader = (
    block: Extract<GroupedFeedBlock, { kind: 'projectGroupHeader' | 'areaGroupHeader' }>,
  ) => {
    if (block.kind === 'projectGroupHeader') {
      return (
        <ProjectGroupHeaderRow
          project={block.project}
          selectionState={selectionStateOf(selectedIds, expandedId, block.project.id)}
        />
      );
    }
    return (
      <AreaGroupHeaderRow
        area={block.area}
        selectionState={selectionStateOf(selectedIds, expandedId, block.area.id)}
      />
    );
  };

  return (
    <div
      ref={flip.rootRef}
      {...dndListProps}
      className="relative flex flex-col"
      onClick={handleBlankClick}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        // 实时预览每次重排都会改变行位置，碰撞检测须用最新的测量结果。
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* 顶部未分组区：未分组任务与独立项目行按合并 feed 顺序交错。
            拖拽期间即使为空也保留投放面（移出项目 = 拖到此处），但浮在
            列表上方，不额外占位（浮动投放面渲染在列表末尾，见下）。 */}
        {freshRows.length > 0 && (
          <UngroupedDropZone containerId={FRESH}>
            <SortableContext items={freshRows.map(feedItemDndId)} strategy={noopSortingStrategy}>
              {freshRows.map((item) => renderRow(item, FRESH))}
            </SortableContext>
          </UngroupedDropZone>
        )}

        {topRows.length > 0 && (
          <UngroupedDropZone>
            <SortableContext items={topRows.map(feedItemDndId)} strategy={noopSortingStrategy}>
              {topRows.map((item) => renderRow(item, UNGROUPED))}
            </SortableContext>
          </UngroupedDropZone>
        )}

        {groupChunks.map((chunk) => {
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
              key={`tasks:${chunk.containerId}`}
              containerId={chunk.containerId}
              taskIds={chunk.taskIds}
            >
              {chunk.taskIds.map(renderTask(chunk.containerId))}
            </TaskContainerDropZone>
          );
        })}

        {/* 绝对定位，DOM 位置不影响显示；放在末尾是为了不挤掉首个组头的
            :first-child（否则 mt-6 生效，拖拽一开始整列下移 24px）。 */}
        {topRows.length === 0 && activeItem && <UngroupedDropZone floating />}

        <DragOverlay dropAnimation={dropAnimation}>
          {overlayItem ? (
            <div className={cn(dragOverlayClass, 'bg-card')} aria-hidden="true" {...{ inert: '' }}>
              <FeedItemRow
                item={overlayItem}
                {...rowLabels(overlayItem, rowContainerOf(layout, overlayItem))}
                hidePlacement={grouping}
                selectionState="idle"
                showScheduledBadge={showScheduledBadge}
                newInToday={rowContainerOf(layout, overlayItem) === FRESH}
              />
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
