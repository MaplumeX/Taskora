import * as React from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
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
import { useCompleteTask, useUncompleteTask } from '@/lib/hooks/useTasks';
import { useTaskRowSelection } from '@/lib/hooks/useTaskRowSelection';
import { useReorderProjectHeadingLayout } from '@/lib/hooks/useProjectHeadings';
import { ProjectHeadingRow } from './ProjectHeadingRow';

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

function cloneLayout(layout: LayoutState): LayoutState {
  return {
    headingIds: [...layout.headingIds],
    containers: Object.fromEntries(
      Object.entries(layout.containers).map(([id, ids]) => [id, [...ids]]),
    ),
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
  selected: boolean;
  expanded: boolean;
  onRowClick: () => void;
  onToggleComplete: () => void;
}

function SortableTask({
  task,
  placeholder,
  selected,
  expanded,
  onRowClick,
  onToggleComplete,
}: SortableTaskProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: taskId(task.id),
  });
  return (
    <div
      ref={setNodeRef}
      data-sortable-task-id={task.id}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging && !placeholder ? 0.45 : undefined,
        zIndex: isDragging && !placeholder ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      {placeholder ? (
        <div
          data-testid={`task-placeholder-${task.id}`}
          className="relative h-10"
          aria-hidden="true"
        >
          <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-primary" />
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
  selectedId: string | null;
  expandedId: string | null;
  onRowClick: (id: string) => void;
  onToggleComplete: (task: TaskResponseDto) => void;
}

function TaskContainer({
  id,
  taskIds,
  taskMap,
  activeTaskId,
  selectedId,
  expandedId,
  onRowClick,
  onToggleComplete,
}: TaskContainerProps) {
  const { setNodeRef } = useDroppable({ id: containerId(id) });
  return (
    <SortableContext items={taskIds.map(taskId)} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} data-task-container={id} className="min-h-10 rounded-md pb-2">
        {taskIds.map((id) => {
          const task = taskMap.get(id);
          if (!task) return null;
          return (
            <SortableTask
              key={id}
              task={task}
              placeholder={activeTaskId === id}
              selected={selectedId === id}
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
      <ProjectHeadingRow heading={heading} dragHandleProps={{ ...attributes, ...listeners }} />
      <TaskContainer {...taskContainerProps} id={heading.id} taskIds={taskIds} />
    </section>
  );
}

export function ProjectTaskLayout({ projectId, tasks, headings, emptyHint }: Props) {
  const { t } = useTranslation();
  const serverLayout = React.useMemo(() => normalizeLayout(tasks, headings), [tasks, headings]);
  const [layout, setLayout] = React.useState(serverLayout);
  const [activeTask, setActiveTask] = React.useState<TaskResponseDto | null>(null);
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
  const { selectedId, expandedId, handleRowClick, handleBlankClick } = useTaskRowSelection();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const saveLayout = useReorderProjectHeadingLayout();
  const keyboardCoordinates = React.useCallback<KeyboardCoordinateGetter>((event, args) => {
    if (event.code === 'ArrowDown' || event.code === 'ArrowRight') {
      keyboardTaskEdgeRef.current = 'after';
    } else if (event.code === 'ArrowUp' || event.code === 'ArrowLeft') {
      keyboardTaskEdgeRef.current = 'before';
    }
    return sortableKeyboardCoordinates(event, args);
  }, []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  const updateRenderedLayout = React.useCallback((next: LayoutState) => {
    layoutRef.current = next;
    setLayout(next);
  }, []);

  React.useEffect(() => {
    if (activeTaskIdRef.current !== null) {
      pendingServerLayoutRef.current = serverLayout;
      return;
    }
    pendingServerLayoutRef.current = null;
    updateRenderedLayout(serverLayout);
  }, [serverLayout, updateRenderedLayout]);

  const toggleComplete = (task: TaskResponseDto) => {
    const mutation = task.status === 'COMPLETED' ? uncompleteTask : completeTask;
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

  const cleanupTaskDrag = () => {
    activeTaskIdRef.current = null;
    dragStartLayoutRef.current = null;
    pendingServerLayoutRef.current = null;
    keyboardTaskEdgeRef.current = 'before';
    lastTaskTargetRef.current = null;
    setActiveTask(null);
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
    handleBlankClick();

    dragStartLayoutRef.current = cloneLayout(layoutRef.current);
    pendingServerLayoutRef.current = null;
    activeTaskIdRef.current = activeId;
    keyboardTaskEdgeRef.current = 'before';
    lastTaskTargetRef.current = null;
    setActiveTask(task);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const activeKey = String(active.id);
    if (!activeKey.startsWith('task:') || !over) return;
    const activeId = activeKey.slice('task:'.length);
    if (activeTaskIdRef.current !== activeId) return;

    const overKey = String(over.id);
    const edge =
      lastTaskTargetRef.current?.overKey === overKey
        ? lastTaskTargetRef.current.edge
        : keyboardTaskEdgeRef.current;
    lastTaskTargetRef.current = { overKey, edge };
    const placement = resolveTaskPlacement(layoutRef.current, overKey, edge);
    if (!placement) return;
    const next = moveTaskToPlacement(layoutRef.current, activeId, placement);
    if (next) updateRenderedLayout(next);
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
        const finalLayout = layoutRef.current;
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

      const finalLayout =
        moveTaskToPlacement(layoutRef.current, activeId, placement) ?? layoutRef.current;
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

  const commonContainerProps = {
    taskMap,
    activeTaskId: activeTask?.id ?? null,
    selectedId,
    expandedId,
    onRowClick: handleRowClick,
    onToggleComplete: toggleComplete,
  };
  const hasContent = taskMap.size > 0 || headings.length > 0;

  return (
    <div className="flex flex-col" onClick={handleBlankClick}>
      {!hasContent ? (
        <div className="mt-12 py-16 text-center text-sm text-muted-foreground">{emptyHint}</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <TaskContainer
            {...commonContainerProps}
            id={UNGROUPED}
            taskIds={layout.containers[UNGROUPED] ?? []}
          />
          <SortableContext
            items={layout.headingIds.map(headingId)}
            strategy={verticalListSortingStrategy}
          >
            {layout.headingIds.map((id) => {
              const heading = headingMap.get(id);
              if (!heading) return null;
              return (
                <SortableHeadingBlock
                  key={id}
                  {...commonContainerProps}
                  heading={heading}
                  taskIds={layout.containers[id] ?? []}
                />
              );
            })}
          </SortableContext>
          <DragOverlay>
            {activeTask ? (
              <div
                className="pointer-events-none w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/70 bg-card shadow-lift"
                aria-hidden="true"
                {...{ inert: '' }}
              >
                <TaskItem
                  task={activeTask}
                  selectionState="idle"
                  onToggleComplete={() => undefined}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

export { applyLayoutDrag, normalizeLayout, serializeLayout };
