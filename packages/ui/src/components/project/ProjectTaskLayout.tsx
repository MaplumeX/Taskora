import * as React from 'react';
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
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  ProjectHeadingResponseDto,
  ReorderProjectHeadingLayoutDto,
  TaskResponseDto,
} from '@taskora/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { TaskItem } from '@/components/task/TaskItem';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/utils';
import {
  useCompleteTask,
  useCreateProjectHeading,
  useSelectionStore,
  useUiInteractionStore,
  useUncancelTask,
  useUncompleteTask,
  type SelectionRow,
} from '@taskora/api';
import { useSelectionScope } from '@taskora/api';
import { useTaskRowSelection } from '@taskora/api';
import { useReorderProjectHeadingLayout } from '@taskora/api';
import { keyboardDragData, useDndSurface } from '../../lib/appDnd';
import type { SidebarDropPayload } from '@/components/layout/sidebarDrop';
import {
  dndListProps,
  dragGroupOf,
  dragOverlayClass,
  dragOverlayWrapperClass,
  expandDragGroup,
  flipId,
  noLayoutAnimation,
  noopSortingStrategy,
  useCollapseAfterDragStart,
  useFlipList,
} from '../../lib/dnd';
import { useLingeringExpanded } from '@/lib/useLingeringExpanded';
import { ProjectHeadingRow } from './ProjectHeadingRow';
import { DragCountBadge } from '@/components/common/DragCountBadge';

const UNGROUPED = 'ungrouped';
export type ContainerId = typeof UNGROUPED | string;

export type TaskPlacementEdge = 'before' | 'after';

export interface TaskPlacement {
  containerId: ContainerId;
  index: number;
}

export interface LayoutState {
  headingIds: string[];
  containers: Record<ContainerId, string[]>;
}

interface Props {
  projectId: string;
  tasks: TaskResponseDto[];
  headings: ProjectHeadingResponseDto[];
  emptyHint: string;
  /**
   * Tag 过滤（tags-things3 issue 05）：只显示这些任务，没有可见任务的
   * Heading 隐藏，拖拽停用（过滤后的布局不能整组写回）。null 表示不过滤。
   */
  visibleTaskIds?: ReadonlySet<string> | null;
  /** 过滤后没有任何可见任务时的提示。 */
  filteredEmptyHint?: string;
}

function normalizeLayout(
  tasks: TaskResponseDto[],
  headings: ProjectHeadingResponseDto[],
): LayoutState {
  const headingIds = headings.map((heading) => heading.id);
  const knownHeadings = new Set(headingIds);
  const containers: Record<string, string[]> = { [UNGROUPED]: [] };
  headingIds.forEach((id) => {
    containers[id] = [];
  });
  tasks.forEach((task) => {
    const container =
      task.headingId && knownHeadings.has(task.headingId) ? task.headingId : UNGROUPED;
    containers[container].push(task.id);
  });
  return { headingIds, containers };
}

/** 过滤后的显示布局：容器只留可见任务，没有可见任务的 Heading 去掉。 */
function filterLayout(layout: LayoutState, visible: ReadonlySet<string>): LayoutState {
  const containers = Object.fromEntries(
    Object.entries(layout.containers).map(([id, ids]) => [id, ids.filter((t) => visible.has(t))]),
  );
  return {
    headingIds: layout.headingIds.filter((id) => (containers[id] ?? []).length > 0),
    containers,
  };
}

function serializeLayout(projectId: string, layout: LayoutState): ReorderProjectHeadingLayoutDto {
  return {
    projectId,
    ungroupedTaskIds: layout.containers[UNGROUPED] ?? [],
    groups: layout.headingIds.map((headingId) => ({
      headingId,
      taskIds: layout.containers[headingId] ?? [],
    })),
  };
}

function taskId(id: string) {
  return `task:${id}`;
}

function headingId(id: string) {
  return `heading:${id}`;
}

function containerId(id: ContainerId) {
  return `container:${id}`;
}

function findTaskContainer(layout: LayoutState, id: string) {
  return Object.keys(layout.containers).find((container) =>
    layout.containers[container].includes(id),
  );
}

/** 键盘重排后的布局：按新行序（Heading 行 + 任务行）重新分配各容器。 */
export function layoutFromRowOrder(layout: LayoutState, rowIds: readonly string[]): LayoutState {
  const known = new Set(layout.headingIds);
  const containers: Record<string, string[]> = { [UNGROUPED]: [] };
  layout.headingIds.forEach((id) => {
    containers[id] = [];
  });
  const headingIds: string[] = [];
  let current: ContainerId = UNGROUPED;
  for (const id of rowIds) {
    if (known.has(id)) {
      headingIds.push(id);
      current = id;
    } else {
      containers[current].push(id);
    }
  }
  return { headingIds, containers };
}

/**
 * 用选中任务新建 Heading（⌥⇧⌘N）：新 Heading 插在首个选中任务所在分组之后
 * （选中任务在无 Heading 部分时成为第一个 Heading），选中任务按显示顺序归入。
 */
export function layoutWithHeadingFromTasks(
  layout: LayoutState,
  headingId: string,
  taskIds: readonly string[],
): LayoutState {
  const moved = new Set(taskIds);
  const origin = findTaskContainer(layout, taskIds[0]) ?? UNGROUPED;
  const containers = Object.fromEntries(
    Object.entries(layout.containers).map(([id, ids]) => [id, ids.filter((t) => !moved.has(t))]),
  );
  containers[headingId] = [...taskIds];
  const headingIds = layout.headingIds.filter((id) => id !== headingId);
  const at = origin === UNGROUPED ? 0 : headingIds.indexOf(origin) + 1;
  headingIds.splice(at, 0, headingId);
  return { headingIds, containers };
}

function cloneLayout(layout: LayoutState): LayoutState {
  return {
    headingIds: [...layout.headingIds],
    containers: Object.fromEntries(
      Object.entries(layout.containers).map(([id, ids]) => [id, [...ids]]),
    ),
  };
}

/** 本列表的拖拽源与落点（共享拖拽上下文里按 id 前缀认领，ADR 0018）。 */
function isLayoutKey(key: string) {
  return key.startsWith('task:') || key.startsWith('container:') || key.startsWith('heading:');
}

/** 布局中任务的显示顺序：无 Heading 区，其后各 Heading 下的任务。 */
function orderedTaskIds(layout: LayoutState): string[] {
  return [
    ...(layout.containers[UNGROUPED] ?? []),
    ...layout.headingIds.flatMap((id) => layout.containers[id] ?? []),
  ];
}

/** 从布局中去掉这些任务。 */
function withoutTasks(layout: LayoutState, ids: ReadonlySet<string>): LayoutState {
  return {
    ...layout,
    containers: Object.fromEntries(
      Object.entries(layout.containers).map(([id, tasks]) => [
        id,
        tasks.filter((task) => !ids.has(task)),
      ]),
    ),
  };
}

/**
 * 多项拖拽松手：组内其余任务从原 Heading 取走，整组按原显示顺序落在被拖任务的
 * 位置（随它进入目标 Heading）。
 */
function withDragGroup(layout: LayoutState, activeId: string, group: string[]): LayoutState {
  const rest = withoutTasks(layout, new Set(group.filter((id) => id !== activeId)));
  const container = findTaskContainer(rest, activeId);
  if (!container) return layout;
  return {
    ...rest,
    containers: {
      ...rest.containers,
      [container]: expandDragGroup(rest.containers[container], activeId, group, (id) => id),
    },
  };
}

function layoutsEqual(left: LayoutState, right: LayoutState) {
  if (left.headingIds.length !== right.headingIds.length) return false;
  if (left.headingIds.some((id, index) => id !== right.headingIds[index])) return false;
  const containerIds = Object.keys(left.containers);
  if (containerIds.length !== Object.keys(right.containers).length) return false;
  return containerIds.every((id) => {
    const leftIds = left.containers[id];
    const rightIds = right.containers[id];
    return (
      rightIds !== undefined &&
      leftIds.length === rightIds.length &&
      leftIds.every((task, index) => task === rightIds[index])
    );
  });
}

export function resolveTaskPlacement(
  layout: LayoutState,
  overKey: string,
  edge: TaskPlacementEdge,
): TaskPlacement | null {
  if (overKey.startsWith('task:')) {
    const overTask = overKey.slice('task:'.length);
    const target = findTaskContainer(layout, overTask);
    if (!target) return null;
    const overIndex = layout.containers[target].indexOf(overTask);
    if (overIndex < 0) return null;
    return {
      containerId: target,
      index: overIndex + (edge === 'after' ? 1 : 0),
    };
  }

  if (overKey.startsWith('heading:')) {
    const target = overKey.slice('heading:'.length);
    if (!layout.containers[target]) return null;
    return { containerId: target, index: 0 };
  }

  if (overKey.startsWith('container:')) {
    const target = overKey.slice('container:'.length);
    const targetIds = layout.containers[target];
    if (!targetIds) return null;
    return { containerId: target, index: targetIds.length };
  }

  return null;
}

export function moveTaskToPlacement(
  layout: LayoutState,
  activeTaskId: string,
  placement: TaskPlacement,
): LayoutState | null {
  const source = findTaskContainer(layout, activeTaskId);
  const targetIds = layout.containers[placement.containerId];
  if (!source || !targetIds) return null;

  const sourceIndex = layout.containers[source].indexOf(activeTaskId);
  let insertionIndex = Math.max(0, Math.min(placement.index, targetIds.length));
  if (source === placement.containerId && sourceIndex < insertionIndex) {
    insertionIndex -= 1;
  }
  const maxIndexAfterRemoval =
    source === placement.containerId ? targetIds.length - 1 : targetIds.length;
  insertionIndex = Math.min(insertionIndex, maxIndexAfterRemoval);
  if (source === placement.containerId && sourceIndex === insertionIndex) return null;

  const containers = Object.fromEntries(
    Object.entries(layout.containers).map(([id, ids]) => [id, [...ids]]),
  );
  containers[source].splice(sourceIndex, 1);
  containers[placement.containerId].splice(insertionIndex, 0, activeTaskId);
  return { ...layout, containers };
}

function applyLayoutDrag(
  layout: LayoutState,
  activeKey: string,
  overKey: string,
): LayoutState | null {
  if (activeKey === overKey) return null;

  if (activeKey.startsWith('heading:')) {
    const activeHeading = activeKey.slice('heading:'.length);
    let overHeading: string | undefined;
    if (overKey.startsWith('heading:')) {
      overHeading = overKey.slice('heading:'.length);
    } else if (overKey.startsWith('container:')) {
      const candidate = overKey.slice('container:'.length);
      if (candidate !== UNGROUPED) overHeading = candidate;
    } else if (overKey.startsWith('task:')) {
      const candidate = findTaskContainer(layout, overKey.slice('task:'.length));
      if (candidate && candidate !== UNGROUPED) overHeading = candidate;
    }
    if (!overHeading) return null;
    const oldIndex = layout.headingIds.indexOf(activeHeading);
    const newIndex = layout.headingIds.indexOf(overHeading);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return null;
    return {
      ...layout,
      headingIds: arrayMove(layout.headingIds, oldIndex, newIndex),
    };
  }

  if (!activeKey.startsWith('task:')) return null;
  const activeTask = activeKey.slice('task:'.length);
  const placement = resolveTaskPlacement(layout, overKey, 'before');
  return placement ? moveTaskToPlacement(layout, activeTask, placement) : null;
}

interface SortableTaskProps {
  task: TaskResponseDto;
  placeholder: boolean;
  /** 过滤视图（如 Tag 过滤）关闭拖拽：只显示部分任务时无法正确落位。 */
  dragDisabled: boolean;
  selected: boolean;
  expanded: boolean;
  onRowClick: () => void;
  onToggleComplete: () => void;
}

function SortableTask({
  task,
  placeholder,
  dragDisabled,
  selected,
  expanded,
  onRowClick,
  onToggleComplete,
}: SortableTaskProps) {
  // 任务拖拽走实时预览：布局随指针重排、位移由 FLIP 动画承担，
  // 不叠加 dnd-kit 的排序位移与布局动画（见 lib/dnd.ts）。
  const { attributes, listeners, setNodeRef } = useSortable({
    id: taskId(task.id),
    animateLayoutChanges: noLayoutAnimation,
    // 展开态下行内是可编辑卡片，整行 listeners 会把框选文字的鼠标移动识别为拖拽，
    // 因此展开时不可拖（仍作为放置目标）。
    disabled: { draggable: expanded || dragDisabled, droppable: false },
  });
  // dnd-kit KeyboardSensor 默认把 Enter/Space 当作「开始拖拽」的启动键，
  // 而行焦点按 Enter=展开 / Space=下方新建是全局键位（ADR-0004）。
  // listeners 铺在整行上时，行内 Enter/Space 会先被拦截成键盘拖拽
  // （isDragging 半透明 + placeholder，且 handleDragStart 会清空
  // selection/expanded），同一事件再冒泡到 window 又触发展开，表现为
  // 「展开的行卡在拖拽态」。因此任务行不响应键盘拖拽启动：剔除
  // listeners 的 onKeyDown，并把 sortable 容器设为不可 Tab 聚焦，
  // 让焦点始终落在 roving tabindex 的行本身。指针拖拽不受影响；
  // KeyboardSensor 保留给 Heading 拖拽手柄（手柄上无键位冲突）。
  const pointerListeners = { ...listeners };
  delete pointerListeners.onKeyDown;
  return (
    <div
      ref={setNodeRef}
      data-sortable-task-id={task.id}
      {...flipId(taskId(task.id))}
      {...attributes}
      {...pointerListeners}
      tabIndex={-1}
    >
      {placeholder ? (
        // 空位：保留真实行（不可见），高度与被拖任务完全一致。
        <div
          data-testid={`task-placeholder-${task.id}`}
          className="invisible"
          aria-hidden="true"
        >
          <TaskItem task={task} selectionState="idle" onToggleComplete={() => undefined} />
        </div>
      ) : (
        <TaskItem
          task={task}
          selectionState={expanded ? 'expanded' : selected ? 'selected' : 'idle'}
          onRowClick={onRowClick}
          onToggleComplete={onToggleComplete}
        />
      )}
    </div>
  );
}

interface TaskContainerProps {
  id: ContainerId;
  taskIds: string[];
  taskMap: Map<string, TaskResponseDto>;
  activeTaskId: string | null;
  dragDisabled: boolean;
  selectedIds: string[];
  expandedId: string | null;
  onRowClick: (id: string) => void;
  onToggleComplete: (task: TaskResponseDto) => void;
}

function TaskContainer({
  id,
  taskIds,
  taskMap,
  activeTaskId,
  dragDisabled,
  selectedIds,
  expandedId,
  onRowClick,
  onToggleComplete,
}: TaskContainerProps) {
  const { setNodeRef } = useDroppable({ id: containerId(id) });
  return (
    <SortableContext items={taskIds.map(taskId)} strategy={noopSortingStrategy}>
      <div ref={setNodeRef} data-task-container={id} className="min-h-10 rounded-md pb-2">
        {taskIds.map((id) => {
          const task = taskMap.get(id);
          if (!task) return null;
          return (
            <SortableTask
              key={id}
              task={task}
              placeholder={activeTaskId === id}
              dragDisabled={dragDisabled}
              selected={selectedIds.includes(id)}
              expanded={expandedId === id}
              onRowClick={() => onRowClick(id)}
              onToggleComplete={() => onToggleComplete(task)}
            />
          );
        })}
      </div>
    </SortableContext>
  );
}

interface SortableHeadingBlockProps extends Omit<TaskContainerProps, 'id' | 'taskIds'> {
  heading: ProjectHeadingResponseDto;
  taskIds: string[];
}

function SortableHeadingBlock({
  heading,
  taskIds,
  ...taskContainerProps
}: SortableHeadingBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: headingId(heading.id),
    disabled: taskContainerProps.dragDisabled,
    // Heading 只经拖拽手柄拖动，手柄上可用键盘拖拽（无全局键位冲突）。
    data: keyboardDragData,
  });
  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
      className="mt-3"
    >
      <div {...flipId(headingId(heading.id))}>
        <ProjectHeadingRow
          heading={heading}
          selected={taskContainerProps.selectedIds.includes(heading.id)}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      </div>
      <TaskContainer {...taskContainerProps} id={heading.id} taskIds={taskIds} />
    </section>
  );
}

export function ProjectTaskLayout({
  projectId,
  tasks: sourceTasks,
  headings,
  emptyHint,
  visibleTaskIds = null,
  filteredEmptyHint,
}: Props) {
  const { t } = useTranslation();
  // 展开中的任务编辑后离开本项目视图（如立即模式下完成）时留在原位，收起后才离开。
  const tasks = useLingeringExpanded(sourceTasks, taskIdOf);
  const serverLayout = React.useMemo(() => normalizeLayout(tasks, headings), [tasks, headings]);
  const [layout, setLayout] = React.useState(serverLayout);
  const [activeTask, setActiveTask] = React.useState<TaskResponseDto | null>(null);
  /** 多项拖拽的整组任务 id（单项拖拽为 null）。 */
  const [dragGroup, setDragGroup] = React.useState<string[] | null>(null);
  const dragGroupRef = React.useRef<string[] | null>(null);
  /** 多项拖拽组内其余任务待收起（拖拽开始那次提交之后才收起）。 */
  const [collapsePending, setCollapsePending] = React.useState(false);
  const layoutRef = React.useRef(layout);
  const serverLayoutRef = React.useRef(serverLayout);
  const activeTaskIdRef = React.useRef<string | null>(null);
  const dragStartLayoutRef = React.useRef<LayoutState | null>(null);
  const pendingServerLayoutRef = React.useRef<LayoutState | null>(null);
  const keyboardTaskEdgeRef = React.useRef<TaskPlacementEdge>('before');
  const lastTaskTargetRef = React.useRef<{
    overKey: string;
    edge: TaskPlacementEdge;
  } | null>(null);
  serverLayoutRef.current = serverLayout;
  const taskMap = React.useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const headingMap = React.useMemo(
    () => new Map(headings.map((heading) => [heading.id, heading])),
    [headings],
  );
  const { selectedIds, expandedId, handleRowClick, handleBlankClick } = useTaskRowSelection();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const uncancelTask = useUncancelTask();
  const saveLayout = useReorderProjectHeadingLayout();
  // 注册可遍历行：ungrouped 任务 → 每个 Heading 后跟其分组任务。
  const shown = React.useMemo(
    () => (visibleTaskIds ? filterLayout(layout, visibleTaskIds) : layout),
    [layout, visibleTaskIds],
  );
  // 过滤后的布局不能整组写回（同拖拽），键盘排序随之停用。
  const reorderable = visibleTaskIds === null;
  const selectionRows = React.useMemo(() => {
    const taskRow = (id: string, container: ContainerId): SelectionRow => {
      const task = taskMap.get(id);
      return {
        id,
        kind: 'task',
        completed: task?.status === 'COMPLETED',
        cancelled: task?.status === 'CANCELLED',
        tagIds: (task?.tags ?? []).map((tag) => tag.id),
        item: task,
        // ⌘↑/⌘↓ 在同一 Heading 下重排
        sortGroup: reorderable ? container : undefined,
      };
    };
    const rows: SelectionRow[] = (shown.containers[UNGROUPED] ?? []).map((id) =>
      taskRow(id, UNGROUPED),
    );
    for (const hid of shown.headingIds) {
      rows.push({ id: hid, kind: 'heading' });
      for (const id of shown.containers[hid] ?? []) rows.push(taskRow(id, hid));
    }
    return rows;
  }, [shown, taskMap, reorderable]);
  // 键盘编辑经 ref 拿到本次渲染的 persist（定义在下方）。
  const persistRef = React.useRef<(next: LayoutState) => void>(() => {});
  const createHeading = useCreateProjectHeading();
  const createHeadingMutate = createHeading.mutate;
  /** ⌥⇧⌘N 新建的 Heading 及要归入的任务：等 Heading 出现在 props 里再写布局。 */
  const [pendingHeading, setPendingHeading] = React.useState<{
    headingId: string;
    taskIds: string[];
  } | null>(null);
  const scopeActions = React.useMemo(
    () =>
      reorderable
        ? {
            reorder: (ids: string[]) =>
              persistRef.current(layoutFromRowOrder(layoutRef.current, ids)),
            headingFromSelection: (taskIds: string[]) =>
              createHeadingMutate(
                { projectId, title: '' },
                {
                  onSuccess: (heading) => setPendingHeading({ headingId: heading.id, taskIds }),
                  onError: () => toast.error(t('project:createHeadingFailed')),
                },
              ),
          }
        : undefined,
    [reorderable, createHeadingMutate, projectId, t],
  );
  useSelectionScope(selectionRows, 0, scopeActions);
  const keyboardCoordinates = React.useCallback<KeyboardCoordinateGetter>((event, args) => {
    if (event.code === 'ArrowDown' || event.code === 'ArrowRight') {
      keyboardTaskEdgeRef.current = 'after';
    } else if (event.code === 'ArrowUp' || event.code === 'ArrowLeft') {
      keyboardTaskEdgeRef.current = 'before';
    }
    return sortableKeyboardCoordinates(event, args);
  }, []);
  const flip = useFlipList<HTMLDivElement>(layout);

  const updateRenderedLayout = React.useCallback((next: LayoutState) => {
    layoutRef.current = next;
    setLayout(next);
  }, []);

  // 多项拖拽：拖拽开始那次提交之后再收起组内其余任务，浮层才贴着手。
  useCollapseAfterDragStart(collapsePending, () => {
    setCollapsePending(false);
    const activeId = activeTaskIdRef.current;
    const group = dragGroupRef.current;
    if (!activeId || !group) return;
    flip.capture();
    const companions = new Set(group.filter((id) => id !== activeId));
    updateRenderedLayout(withoutTasks(layoutRef.current, companions));
  });

  React.useEffect(() => {
    if (activeTaskIdRef.current !== null) {
      pendingServerLayoutRef.current = serverLayout;
      return;
    }
    pendingServerLayoutRef.current = null;
    updateRenderedLayout(serverLayout);
  }, [serverLayout, updateRenderedLayout]);

  const toggleComplete = (task: TaskResponseDto) => {
    // 撤销了结（尚未移入 Logbook 的条目还在这里）：已取消 → 撤销取消
    const mutation =
      task.status === 'CANCELLED'
        ? uncancelTask
        : task.status === 'COMPLETED'
          ? uncompleteTask
          : completeTask;
    mutation.mutate(task.id, {
      onError: () => toast.error(t('common:operationFailed')),
    });
  };

  const persist = (next: LayoutState) => {
    // Freeze the server-derived layout before the mutation's optimistic cache update
    // feeds the submitted layout back through props.
    const rollbackLayout = cloneLayout(serverLayoutRef.current);
    updateRenderedLayout(next);
    saveLayout.mutate(serializeLayout(projectId, next), {
      onError: () => {
        updateRenderedLayout(rollbackLayout);
        toast.error(t('common:saveFailed'));
      },
    });
  };

  persistRef.current = persist;

  React.useEffect(() => {
    if (!pendingHeading || !headings.some((h) => h.id === pendingHeading.headingId)) return;
    setPendingHeading(null);
    persistRef.current(
      layoutWithHeadingFromTasks(
        layoutRef.current,
        pendingHeading.headingId,
        pendingHeading.taskIds,
      ),
    );
    // 同新建 Heading：Selection 移到新 Heading 并进入标题编辑。
    useUiInteractionStore.getState().setPendingAutoEditId(pendingHeading.headingId);
    useSelectionStore.getState().setSelection([pendingHeading.headingId]);
  }, [pendingHeading, headings]);

  const cleanupTaskDrag = () => {
    activeTaskIdRef.current = null;
    dragStartLayoutRef.current = null;
    pendingServerLayoutRef.current = null;
    keyboardTaskEdgeRef.current = 'before';
    lastTaskTargetRef.current = null;
    dragGroupRef.current = null;
    setActiveTask(null);
    setDragGroup(null);
    setCollapsePending(false);
  };

  const restoreTaskDrag = () => {
    const restoredLayout = pendingServerLayoutRef.current ?? dragStartLayoutRef.current;
    cleanupTaskDrag();
    if (restoredLayout) updateRenderedLayout(restoredLayout);
  };

  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const activeKey = String(args.active.id);
    if (activeKey.startsWith('heading:')) {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) =>
          String(container.id).startsWith('heading:'),
        ),
      });
    }
    if (!activeKey.startsWith('task:')) return [];

    const compatibleContainers = args.droppableContainers.filter((container) => {
      const id = String(container.id);
      return (
        id.startsWith('task:') || id.startsWith('container:') || id.startsWith('heading:')
      );
    });
    const collisions = args.pointerCoordinates
      ? pointerWithin({ ...args, droppableContainers: compatibleContainers })
      : closestCenter({ ...args, droppableContainers: compatibleContainers });
    if (collisions.length === 0) return [];

    const collision = args.pointerCoordinates
      ? (collisions.find(({ id }) => String(id).startsWith('task:')) ??
        collisions.find(({ id }) => String(id).startsWith('container:')) ??
        collisions.find(({ id }) => String(id).startsWith('heading:')))
      : collisions[0];
    if (!collision) return [];

    const overKey = String(collision.id);
    let edge: TaskPlacementEdge = 'before';
    if (overKey.startsWith('task:')) {
      const rect = args.droppableRects.get(collision.id);
      if (args.pointerCoordinates && rect) {
        edge = args.pointerCoordinates.y >= rect.top + rect.height / 2 ? 'after' : 'before';
      } else {
        edge = keyboardTaskEdgeRef.current;
      }
    }
    lastTaskTargetRef.current = { overKey, edge };
    return [collision];
  }, []);

  const handleDragStart = ({ active }: DragStartEvent) => {
    const activeKey = String(active.id);
    if (!activeKey.startsWith('task:')) return;
    const activeId = activeKey.slice('task:'.length);
    const task = taskMap.get(activeId);
    if (!task) return;

    const focused = document.activeElement as HTMLElement | null;
    const sortableTask = focused?.closest<HTMLElement>('[data-sortable-task-id]');
    if (sortableTask?.dataset.sortableTaskId === activeId) focused?.blur();
    const group = dragGroupOf(
      activeId,
      orderedTaskIds(layoutRef.current),
      useSelectionStore.getState().selectedIds,
    );
    // 多项拖拽保留多选（松手后整组仍选中）；单项拖拽照旧清掉选中。
    if (!group) handleBlankClick();

    dragStartLayoutRef.current = cloneLayout(layoutRef.current);
    pendingServerLayoutRef.current = null;
    activeTaskIdRef.current = activeId;
    keyboardTaskEdgeRef.current = 'before';
    lastTaskTargetRef.current = null;
    dragGroupRef.current = group;
    setActiveTask(task);
    setDragGroup(group);
    setCollapsePending(!!group);
  };

  /** 松手时的最终布局：多项拖拽把整组放回被拖任务的位置。 */
  const withGroup = (next: LayoutState, activeId: string) => {
    const group = dragGroupRef.current;
    return group ? withDragGroup(next, activeId, group) : next;
  };

  const previewTaskTarget = (activeKey: string) => {
    if (!activeKey.startsWith('task:')) return;
    const activeId = activeKey.slice('task:'.length);
    if (activeTaskIdRef.current !== activeId) return;
    const target = lastTaskTargetRef.current;
    if (!target) return;
    const placement = resolveTaskPlacement(layoutRef.current, target.overKey, target.edge);
    if (!placement) return;
    const next = moveTaskToPlacement(layoutRef.current, activeId, placement);
    if (!next) return;
    flip.capture();
    updateRenderedLayout(next);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const overKey = String(over.id);
    if (!isLayoutKey(overKey)) {
      // 指针在列表外的落点上（侧边栏）：空位回到原处，不暗示列表内重排。
      lastTaskTargetRef.current = null;
      const snapshot = dragStartLayoutRef.current;
      const activeId = activeTaskIdRef.current;
      if (!snapshot || !activeId) return;
      const group = dragGroupRef.current;
      const origin = group
        ? withoutTasks(snapshot, new Set(group.filter((id) => id !== activeId)))
        : snapshot;
      if (layoutsEqual(origin, layoutRef.current)) return;
      flip.capture();
      updateRenderedLayout(origin);
      return;
    }
    if (lastTaskTargetRef.current?.overKey !== overKey) {
      lastTaskTargetRef.current = { overKey, edge: keyboardTaskEdgeRef.current };
    }
    previewTaskTarget(String(active.id));
  };

  // dnd-kit 只在 over.id 变化时触发 onDragOver；同一行内越过中线（before ↔
  // after）要靠每次指针移动重读碰撞检测记下的 edge，空位才会跟上。
  const handleDragMove = ({ active }: DragMoveEvent) => {
    previewTaskTarget(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const activeKey = String(active.id);
    if (activeKey.startsWith('task:')) {
      const activeId = activeKey.slice('task:'.length);
      const snapshot = dragStartLayoutRef.current;
      if (!snapshot || activeTaskIdRef.current !== activeId) {
        cleanupTaskDrag();
        return;
      }
      if (!over) {
        const finalLayout = withGroup(layoutRef.current, activeId);
        if (layoutsEqual(snapshot, finalLayout)) {
          restoreTaskDrag();
          return;
        }
        cleanupTaskDrag();
        persist(finalLayout);
        return;
      }

      const overKey = String(over.id);
      const edge =
        lastTaskTargetRef.current?.overKey === overKey
          ? lastTaskTargetRef.current.edge
          : keyboardTaskEdgeRef.current;
      const placement = resolveTaskPlacement(layoutRef.current, overKey, edge);
      if (!placement) {
        restoreTaskDrag();
        return;
      }

      const finalLayout = withGroup(
        moveTaskToPlacement(layoutRef.current, activeId, placement) ?? layoutRef.current,
        activeId,
      );
      if (!layoutsEqual(finalLayout, layoutRef.current)) updateRenderedLayout(finalLayout);
      const changed = !layoutsEqual(snapshot, finalLayout);
      if (!changed) {
        restoreTaskDrag();
        return;
      }
      cleanupTaskDrag();
      persist(finalLayout);
      return;
    }

    if (!over) return;
    const next = applyLayoutDrag(layoutRef.current, activeKey, String(over.id));
    if (next) persist(next);
  };

  const handleDragCancel = () => {
    if (activeTaskIdRef.current !== null) restoreTaskDrag();
  };

  /** 拖到侧边栏的载荷：被拖任务，多选时为整组（按显示顺序）。 */
  const sidebarPayload = (activeKey: string): SidebarDropPayload | null => {
    if (!activeKey.startsWith('task:')) return null;
    const ids = dragGroupRef.current ?? [activeKey.slice('task:'.length)];
    const tasks = ids.flatMap((id) => taskMap.get(id) ?? []);
    return tasks.length > 0 ? { kind: 'tasks', tasks } : null;
  };

  // 共享拖拽上下文里的一个 surface（ADR 0018）。
  const surface = useDndSurface({
    owns: isLayoutKey,
    collisionDetection,
    keyboardCoordinates,
    sidebarPayload,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    onDragCancel: handleDragCancel,
  });

  const commonContainerProps = {
    taskMap,
    activeTaskId: activeTask?.id ?? null,
    dragDisabled: !!visibleTaskIds,
    selectedIds,
    expandedId,
    onRowClick: handleRowClick,
    onToggleComplete: toggleComplete,
  };
  const hasContent = taskMap.size > 0 || headings.length > 0;
  const filteredEmpty =
    !!visibleTaskIds && Object.values(shown.containers).every((ids) => ids.length === 0);

  return (
    <div
      ref={flip.rootRef}
      {...dndListProps}
      className="flex flex-col"
      onClick={handleBlankClick}
    >
      {!hasContent || filteredEmpty ? (
        <EmptyState hint={filteredEmpty ? (filteredEmptyHint ?? emptyHint) : emptyHint} />
      ) : (
        <>
          <TaskContainer
            {...commonContainerProps}
            id={UNGROUPED}
            taskIds={shown.containers[UNGROUPED] ?? []}
          />
          <SortableContext
            items={shown.headingIds.map(headingId)}
            strategy={verticalListSortingStrategy}
          >
            {shown.headingIds.map((id) => {
              const heading = headingMap.get(id);
              if (!heading) return null;
              return (
                <SortableHeadingBlock
                  key={id}
                  {...commonContainerProps}
                  heading={heading}
                  taskIds={shown.containers[id] ?? []}
                />
              );
            })}
          </SortableContext>
          {surface.overlayActive && (
          <DragOverlay className={dragOverlayWrapperClass} dropAnimation={surface.dropAnimation}>
            {activeTask ? (
              <div
                className={cn(dragOverlayClass, 'relative bg-card')}
                aria-hidden="true"
                {...{ inert: '' }}
              >
                <TaskItem
                  task={activeTask}
                  selectionState="idle"
                  onToggleComplete={() => undefined}
                />
                <DragCountBadge count={dragGroup?.length ?? 0} />
              </div>
            ) : null}
          </DragOverlay>
          )}
        </>
      )}
    </div>
  );
}

export { applyLayoutDrag, filterLayout, normalizeLayout, serializeLayout };

function taskIdOf(task: TaskResponseDto) {
  return task.id;
}
