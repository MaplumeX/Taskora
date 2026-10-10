import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  closestCenter,
  DragOverlay,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { toast } from 'sonner';

import type {
  CreateTaskDto,
  FeedItem,
  FeedOrderItem,
  TaskFeedItem,
  UpdateTaskDto,
} from '@taskora/shared';

import { cn } from '@/lib/utils';
import { useDndSurface } from '../../lib/appDnd';
import {
  MAGIC_PLUS_DRAFT_ID,
  MAGIC_PLUS_ID,
  isMagicPlus,
  magicPlusDraftFeedItem,
  useMagicPlusCreate,
} from '../../lib/magicPlus';
import type { SidebarDropPayload } from '@/components/layout/sidebarDrop';
import {
  dndListProps,
  dragGroupOf,
  dragOverlayClass,
  dragOverlayWrapperClass,
  expandDragGroup,
  flipId,
  noopSortingStrategy,
  useFlipList,
  useCollapseAfterDragStart,
  useHeldValue,
} from '../../lib/dnd';
import { FeedItemRow } from './FeedItemRow';
import { SortableFeedRow } from './SortableFeedRow';
import { EmptyState } from '@/components/common/EmptyState';
import { DragCountBadge } from '@/components/common/DragCountBadge';
import { ProjectGroupHeaderRow } from './ProjectGroupHeaderRow';
import { AreaGroupHeaderRow } from './AreaGroupHeaderRow';
import {
  deriveGroupedFeedLayout,
  feedItemKey,
  type GroupedFeedBlock,
  type GroupedFeedLayout,
} from './groupedFeedLayout';
import {
  markNewInTodaySeen,
  selectionStateOf,
  useAreasQuery,
  useCompleteTask,
  usePageTaskContext,
  useProjectsQuery,
  useReorderFeed,
  useSelectionScope,
  useSelectionStore,
  useTaskRowSelection,
  useUncancelTask,
  useUncompleteTask,
  useUpdateTask,
  type SelectionRow,
} from '@taskora/api';
import type { ScheduledBadgeMode } from '@/components/task/TaskDateBadge';

interface Props {
  items: FeedItem[];
  emptyHint?: string;
  /** 视图本身已表达日期语境时传 false（如 Today），省略行首日期 chip。 */
  showScheduledBadge?: ScheduledBadgeMode;
  /**
   * 是否按项目/区域分组（默认 true）。关闭时为平铺列表：全部任务在
   * 未分组区、与独立项目行按 feed 顺序交错，拖拽只重排、不改归属。
   */
  grouping?: boolean;
  /**
   * New in Today 未读新到条目的键（`task:<id>` / `project:<id>`）：留在原位，
   * 行首带黄点；拖拽排序即已读。
   */
  freshKeys?: ReadonlySet<string>;
}

const UNGROUPED = 'ungrouped';
type ContainerId = typeof UNGROUPED | string;

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

/** 推导结果中每个任务所在的容器（组头 id；顶部未分组区 UNGROUPED）。 */
export function taskContainersOf(layout: GroupedFeedLayout): Map<string, ContainerId> {
  const containers = new Map<string, ContainerId>();
  for (const block of layout.blocks) {
    if (block.kind === 'task') {
      containers.set(block.item.id, block.groupHeaderId ?? UNGROUPED);
    }
  }
  return containers;
}

/** 行所在的容器：任务按推导结果；独立项目行恒在顶部未分组区。 */
function rowContainerOf(
  layout: GroupedFeedLayout,
  item: Pick<FeedItem, 'type' | 'id'>,
): ContainerId | undefined {
  return item.type === 'task' ? taskContainersOf(layout).get(item.id) : UNGROUPED;
}

/** 顶部未分组区的行（按显示顺序）。 */
function topRowsOf(layout: GroupedFeedLayout): FeedItem[] {
  return layout.blocks.flatMap((block): FeedItem[] => {
    if (block.kind === 'projectRow') return [block.item];
    if (block.kind === 'task' && block.groupHeaderId === null) return [block.item];
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
      containerId === UNGROUPED
        ? topRowsOf(layout)
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
    if (targetContainer !== UNGROUPED && !parentMapsFromLayout(layout).kinds.has(targetContainer)) {
      return null;
    }
    anchor = lastIn(targetContainer);
    after = true;
  } else {
    return null;
  }
  if (active.type === 'project' && targetContainer !== UNGROUPED) {
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

/** 本列表的拖拽源与落点（共享拖拽上下文里按 id 前缀认领，ADR 0018）。 */
function isFeedKey(key: string) {
  return (
    isRowKey(key) || key.startsWith(CONTAINER_DND_PREFIX) || key.startsWith(HEADER_DND_PREFIX)
  );
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
      className="mt-6 first:mt-0"
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
  floating = false,
  fill = false,
  children,
}: {
  floating?: boolean;
  /** 空列表里拖 Magic Plus：占满一块投放面（列表里没有别的落点）。 */
  fill?: boolean;
  children?: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: containerDndId(UNGROUPED) });
  return (
    <div
      ref={setNodeRef}
      data-task-container={UNGROUPED}
      className={cn(
        'flex flex-col rounded-md',
        floating && 'absolute inset-x-0 bottom-full h-10',
        fill && 'min-h-40',
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
 * Grouped View（分组视图）列表：今天/随时/某天三个时间视图按项目/区域
 * 聚类展示任务。分组为纯渲染层推导（deriveGroupedFeedLayout），扁平单层、
 * 不可折叠；组内拖拽重排写回全局 Position，跨组拖拽改任务归属，组头不
 * 可拖拽（组间顺序由侧边栏持有）。顶部未分组区的独立项目行可与任务一起
 * 拖拽排序，写回项目的 Feed Position（不影响侧边栏顺序）。
 *
 * 拖拽为实时预览：拖拽中在本地 feed 项副本上挪位（含跨组改归属）并重新
 * 推导分组，空位即落点；松手后本地结果保留到乐观更新追上（lib/dnd.ts）。
 * grouping=false 时同一套渲染与拖拽用于平铺时间视图。
 *
 * Magic Plus：被拖的是一条不在列表里的草稿任务（来源容器不存在，落到任何
 * 组都按该组改归属），预览与行拖拽同一路径；松手后按落点新建任务，再把
 * 草稿替换为新任务写回顺序。
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
  const uncancelTask = useUncancelTask();
  const reorderFeed = useReorderFeed();
  const updateTask = useUpdateTask();
  const magicPlus = useMagicPlusCreate(usePageTaskContext());

  const derive = (list: FeedItem[], retainGroupIds?: ReadonlySet<string>) =>
    deriveGroupedFeedLayout({
      items: list,
      projects,
      areas,
      groupingEnabled: grouping,
      retainGroupIds,
    });

  // 松手后的本地结果：显示顺序与任务归属追上之前一直以它渲染。
  const [shownItems, holdItems] = useHeldValue(items, (list) => feedSignature(derive(list)));
  const [drag, setDrag] = React.useState<{
    /** 拖拽源的 dnd id：行为 feedItemDndId，Magic Plus 为 MAGIC_PLUS_ID。 */
    activeKey: string;
    origin: { item: FeedItem; container: ContainerId };
    items: FeedItem[];
    /** 未预览任何落点时的行（拖拽开始时的原样；收起组内其余行后同样去掉它们）。 */
    startItems: FeedItem[];
    /** 拖拽中保留的组（即使已空）：被拖行与多项拖拽组内各行的原组。 */
    retain: ReadonlySet<string> | undefined;
    /** 多项拖拽：整组任务（拖拽开始时的原样，按显示顺序，含被拖任务）。 */
    group: TaskFeedItem[] | null;
    /** 组内其余行是否已收起（拖拽开始那次提交之后才收起）。 */
    collapsed: boolean;
  } | null>(null);
  const dragRef = React.useRef(drag);
  const lastTargetRef = React.useRef<FeedDragTarget | null>(null);

  const viewItems = drag?.items ?? shownItems;
  const retainGroupIds = drag?.retain;
  const layout = React.useMemo(
    () => derive(viewItems, retainGroupIds),
    // derive 只依赖 projects / areas / grouping
    [viewItems, retainGroupIds, projects, areas, grouping],
  );
  const flip = useFlipList<HTMLDivElement>(layout);

  // 多项拖拽：拖拽开始那次提交之后再收起组内其余行，浮层才贴着手。
  useCollapseAfterDragStart(!!drag && !drag.collapsed, () => {
    const current = dragRef.current;
    if (!current || current.collapsed) return;
    const companions = new Set(
      (current.group ?? []).flatMap((task) =>
        task.id === current.origin.item.id ? [] : [task.id],
      ),
    );
    flip.capture();
    const withoutCompanions = (list: FeedItem[]) =>
      list.filter((row) => row.type !== 'task' || !companions.has(row.id));
    updateDrag({
      ...current,
      collapsed: true,
      items: withoutCompanions(current.items),
      startItems: withoutCompanions(current.startItems),
    });
  });

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
              item: block.item,
              // ⌘↑/⌘↓ 只在组内（或顶部未分组区内）重排，不经键盘改归属。
              sortGroup: block.groupHeaderId ?? UNGROUPED,
            };
          case 'projectRow':
            return {
              id: block.item.id,
              kind: 'project',
              tagIds: block.item.tags.map((tag) => tag.id),
              item: block.item,
              sortGroup: UNGROUPED,
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
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  const reorderFeedMutate = reorderFeed.mutate;
  // ⌘↑/⌘↓：新行序按显示顺序写回（同拖拽松手），组头不写；挪动即已读（New in Today）。
  const scopeActions = React.useMemo(
    () => ({
      reorder: (ids: string[]) => {
        const rowById = new Map(rowsRef.current.map((row) => [row.id, row]));
        const order = ids.flatMap((id): FeedOrderItem[] => {
          const row = rowById.get(id);
          if (!row || row.groupHeader) return [];
          return [{ type: row.kind === 'project' ? 'project' : 'task', id }];
        });
        for (const id of useSelectionStore.getState().selectedIds) {
          const row = rowById.get(id);
          if (row && !row.groupHeader) {
            markNewInTodaySeen(row.kind === 'project' ? 'project' : 'task', id);
          }
        }
        reorderFeedMutate(order);
      },
    }),
    [reorderFeedMutate],
  );
  useSelectionScope(rows, 0, scopeActions);

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

  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const activeKey = String(args.active.id);
    if (!isRowKey(activeKey) && !isMagicPlus(activeKey)) return [];
    const compatible = args.droppableContainers.filter((container) =>
      isFeedKey(String(container.id)),
    );
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

  const handleToggle = (item: TaskFeedItem) => {
    // 撤销了结（尚未移入 Logbook 的条目还在这里）：已取消 → 撤销取消
    if (item.status === 'CANCELLED') uncancelTask.mutate(item.id);
    else if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
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
    if (isMagicPlus(String(active.id))) {
      handleBlankClick();
      lastTargetRef.current = null;
      updateDrag({
        activeKey: MAGIC_PLUS_ID,
        // 来源容器不存在：落在任何组（含未分组区）都按该组定归属。
        origin: { item: magicPlusDraftFeedItem(magicPlus.context), container: MAGIC_PLUS_DRAFT_ID },
        items: viewItems,
        startItems: viewItems,
        retain: undefined,
        group: null,
        collapsed: true,
      });
      return;
    }
    const item = rowMap.get(String(active.id));
    if (!item) return;
    const container = rowContainerOf(layout, item);
    if (container === undefined) return;

    const focused = document.activeElement as HTMLElement | null;
    const sortableTask = focused?.closest<HTMLElement>('[data-sortable-task-id]');
    if (sortableTask?.dataset.sortableTaskId === item.id) focused?.blur();

    const groupIds =
      item.type === 'task'
        ? dragGroupOf(
            item.id,
            feedOrderOf(layout).flatMap((row) => (row.type === 'task' ? [row.id] : [])),
            useSelectionStore.getState().selectedIds,
          )
        : null;
    // 多项拖拽保留多选（松手后整组仍选中）；单项拖拽照旧清掉选中。
    if (!groupIds) handleBlankClick();
    // 按显示顺序（groupIds）取，而非 feed 数组顺序：分组时未分组区排在各组之前。
    const taskById = new Map(
      viewItems.flatMap((row) => (row.type === 'task' ? [[row.id, row] as const] : [])),
    );
    const group = groupIds?.flatMap((id) => taskById.get(id) ?? []) ?? null;
    // 组内原组都保留（即使拖拽中已空），收起其余行时组头不消失。
    const containers = taskContainersOf(layout);
    const retain = new Set(
      [container, ...(groupIds ?? []).map((id) => containers.get(id))].filter(
        (id): id is string => id !== undefined && id !== UNGROUPED,
      ),
    );
    lastTargetRef.current = null;
    updateDrag({
      activeKey: feedItemDndId(item),
      origin: { item, container },
      items: viewItems,
      startItems: viewItems,
      retain: retain.size > 0 ? retain : undefined,
      group,
      collapsed: !group,
    });
  };

  /** 把当前碰撞目标应用到拖拽副本上；返回应用后的 feed 项。 */
  const applyTarget = (target: FeedDragTarget | null) => {
    const current = dragRef.current;
    if (!current || !target) return current?.items ?? null;
    const next = moveFeedItemToTarget(
      current.items,
      derive(current.items, current.retain),
      current.origin,
      target,
    );
    return next ?? current.items;
  };

  const previewTarget = (activeKey: string) => {
    const current = dragRef.current;
    if (!current || activeKey !== current.activeKey) return;
    const next = applyTarget(lastTargetRef.current);
    if (!next || next === current.items) return;
    flip.capture();
    updateDrag({ ...current, items: next });
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const overKey = String(over.id);
    if (!isFeedKey(overKey)) {
      // 指针在列表外的落点上（侧边栏）：空位回到原处，不暗示列表内重排。
      lastTargetRef.current = null;
      const current = dragRef.current;
      if (current && current.items !== current.startItems) {
        flip.capture();
        updateDrag({ ...current, items: current.startItems });
      }
      return;
    }
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
    const droppedItems = applyTarget(target);
    lastTargetRef.current = null;
    updateDrag(null);
    if (!current || !droppedItems || String(active.id) !== current.activeKey) {
      return;
    }
    if (isMagicPlus(current.activeKey)) {
      dropMagicPlus(droppedItems);
      return;
    }

    const moved = current.origin.item;
    const before = derive(items);
    const finalItems = current.group
      ? withFeedDragGroup(
          droppedItems,
          derive(droppedItems),
          moved.id,
          current.group,
          taskContainersOf(before),
        )
      : droppedItems;
    if (!finalItems) return;
    const after = derive(finalItems);
    const beforeOrder = feedOrderOf(before);
    const afterOrder = feedOrderOf(after);
    const orderChanged = feedOrderKey(afterOrder) !== feedOrderKey(beforeOrder);
    // 跨组的任务（多项拖拽时组内每一项各自比较）改归属。
    const reassignments: Array<{ id: string; data: UpdateTaskDto }> = [];
    if (moved.type === 'task') {
      const fromContainers = taskContainersOf(before);
      const toContainers = taskContainersOf(after);
      const maps = parentMapsFromLayout(after);
      for (const id of current.group?.map((task) => task.id) ?? [moved.id]) {
        const fromContainer = fromContainers.get(id);
        const toContainer = toContainers.get(id);
        if (fromContainer === undefined || toContainer === undefined) return;
        if (toContainer === fromContainer) continue;
        const data = reassignmentDto(toContainer, maps);
        if (!data) return;
        reassignments.push({ id, data });
      }
    }
    if (!orderChanged && reassignments.length === 0) return;

    // 拖拽排序新到条目即已读（New in Today；多项拖拽整组）。
    if (moved.type === 'project') markNewInTodaySeen('project', moved.id);
    else for (const task of current.group ?? [moved]) markNewInTodaySeen('task', task.id);
    holdItems(finalItems);
    // 跨组 = 改归属（headingId 由数据层随 projectId 变化自动清除）；顺序按
    // 显示顺序写回：任务写 Position，独立项目行写 Feed Position。跨组时
    // 即使显示顺序没变也要写：分组时组内任务总排在顶部区之后、与其位次
    // 无关，进入顶部区后才按真实位次排（repositionFeed 已在序则不写）。
    for (const { id, data } of reassignments) updateTask.mutate({ id, data });
    if (orderChanged || reassignments.length > 0) reorderFeed.mutate(afterOrder);
  };

  const handleDragCancel = () => {
    lastTargetRef.current = null;
    updateDrag(null);
  };

  /**
   * Magic Plus 松手：草稿所在组决定归属，先以含草稿的结果占位，新建成功后
   * 换成真实任务并写回显示顺序；没落在任何落点（草稿不在结果里）即取消。
   */
  const dropMagicPlus = (droppedItems: FeedItem[]) => {
    const dropped = derive(droppedItems);
    const container = taskContainersOf(dropped).get(MAGIC_PLUS_DRAFT_ID);
    if (container === undefined) return;
    const owner = container === UNGROUPED ? null : reassignmentDto(container, parentMapsFromLayout(dropped));
    const fields: Omit<Partial<CreateTaskDto>, 'title'> = {};
    if (owner?.projectId) fields.projectId = owner.projectId;
    if (owner?.areaId) fields.areaId = owner.areaId;
    holdItems(droppedItems);
    void magicPlus.create(fields).then((created) => {
      if (!created) {
        holdItems(items);
        return;
      }
      const createdItem: TaskFeedItem = { ...created, type: 'task', tags: created.tags ?? [] };
      const finalItems = droppedItems.map((row) =>
        row.type === 'task' && row.id === MAGIC_PLUS_DRAFT_ID ? createdItem : row,
      );
      holdItems(finalItems);
      reorderFeed.mutate(feedOrderOf(derive(finalItems)));
    });
  };

  /** 拖到侧边栏的载荷：被拖任务（多选时整组，拖拽开始时的原样）或独立项目行。 */
  const sidebarPayload = (activeKey: string): SidebarDropPayload | null => {
    const current = dragRef.current;
    const item = current?.origin.item ?? rowMap.get(activeKey);
    if (!item || feedItemDndId(item) !== activeKey) return null;
    if (item.type === 'project') return { kind: 'project', project: item };
    return { kind: 'tasks', tasks: current?.group ?? [item] };
  };

  const surface = useDndSurface({
    owns: isFeedKey,
    magicPlus: true,
    collisionDetection,
    sidebarPayload,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    onDragCancel: handleDragCancel,
  });

  if (shownItems.length === 0 && !drag) {
    return <EmptyState hint={emptyHint ?? t('task:empty')} />;
  }

  const activeItem = drag?.origin.item ?? null;
  // 跨组预览会改写归属字段，浮层跟随当前预览中的那一行。
  const overlayItem = activeItem ? rowMap.get(feedItemDndId(activeItem)) ?? activeItem : null;

  // 顶部未分组区：未分组任务与独立项目行按 feed 顺序交错，同属一个可排序
  // 容器。其后是扁平单层的分组：组头 + 组内任务。
  const topRows = topRowsOf(layout);
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

  // 孤儿任务在未分组区保留项目/区域标题标签；组内任务的归属已由组头
  // 表达，不再重复标签。列表行与拖拽浮层共用，保证拖起来的就是那一行。
  const rowLabels = (item: FeedItem, containerId: ContainerId | undefined) => {
    const ungrouped = containerId === UNGROUPED;
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
        placeholder={
          (activeItem !== null && feedItemDndId(activeItem) === dndId) ||
          // Magic Plus 松手到新任务建好之间，草稿仍是空位（不可点、不可勾选）。
          (item.type === 'task' && item.id === MAGIC_PLUS_DRAFT_ID)
        }
        {...rowLabels(item, containerId)}
        hidePlacement={grouping}
        selectionState={selectionStateOf(selectedIds, expandedId, item.id)}
        showScheduledBadge={showScheduledBadge}
        newInToday={freshKeys?.has(feedItemKey(item)) ?? false}
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
          newInToday={freshKeys?.has(feedItemKey({ type: 'project', id: block.project.id }))}
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
        {/* 顶部未分组区：未分组任务与独立项目行按合并 feed 顺序交错。
            拖拽期间即使为空也保留投放面（移出项目 = 拖到此处），但浮在
            列表上方，不额外占位（浮动投放面渲染在列表末尾，见下）。 */}
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
        {topRows.length === 0 && activeItem && (
          <UngroupedDropZone floating={layout.blocks.length > 0} fill={layout.blocks.length === 0} />
        )}

        {surface.overlayActive && (
        <DragOverlay className={dragOverlayWrapperClass} dropAnimation={surface.dropAnimation}>
          {overlayItem ? (
            <div
              className={cn(dragOverlayClass, 'relative bg-card')}
              aria-hidden="true"
              {...{ inert: '' }}
            >
              <FeedItemRow
                item={overlayItem}
                {...rowLabels(overlayItem, rowContainerOf(layout, overlayItem))}
                hidePlacement={grouping}
                selectionState="idle"
                showScheduledBadge={showScheduledBadge}
                newInToday={freshKeys?.has(feedItemKey(overlayItem)) ?? false}
              />
              <DragCountBadge count={drag?.group?.length ?? 0} />
            </div>
          ) : null}
        </DragOverlay>
        )}
    </div>
  );
}

/**
 * 多项拖拽松手：整组按原显示顺序落在被拖任务的位置。组内其余任务随它进入
 * 落点所在组：原本就在该组的保留原字段，其余按该组改写归属。
 */
function withFeedDragGroup(
  items: FeedItem[],
  layout: GroupedFeedLayout,
  activeId: string,
  group: TaskFeedItem[],
  startContainers: ReadonlyMap<string, ContainerId>,
): FeedItem[] | null {
  const container = taskContainersOf(layout).get(activeId);
  const moved = items.find((item) => item.type === 'task' && item.id === activeId);
  if (container === undefined || !moved) return null;
  const data = reassignmentDto(container, parentMapsFromLayout(layout));
  if (!data) return null;
  const placed = group.map((task): FeedItem => {
    if (task.id === activeId) return moved;
    if (startContainers.get(task.id) === container) return task;
    return { ...task, projectId: data.projectId ?? null, areaId: data.areaId ?? null };
  });
  return expandDragGroup(items, feedItemDndId(moved), placed, feedItemDndId);
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
