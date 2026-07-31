import * as React from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
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
import { cn } from '@/lib/utils';
import { ProjectHeadingRow } from './ProjectHeadingRow';

const UNGROUPED = 'ungrouped';
type ContainerId = typeof UNGROUPED | string;

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
  tasks
    .filter((task) => !task.parentId)
    .forEach((task) => {
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
  const source = findTaskContainer(layout, activeTask);
  if (!source) return null;

  let target: string | undefined;
  let overTask: string | undefined;
  if (overKey.startsWith('task:')) {
    overTask = overKey.slice('task:'.length);
    target = findTaskContainer(layout, overTask);
  } else if (overKey.startsWith('container:')) {
    target = overKey.slice('container:'.length);
  } else if (overKey.startsWith('heading:')) {
    target = overKey.slice('heading:'.length);
  }
  if (!target || !layout.containers[target]) return null;

  const containers = Object.fromEntries(
    Object.entries(layout.containers).map(([id, ids]) => [id, [...ids]]),
  );
  if (source === target && overTask) {
    const oldIndex = containers[source].indexOf(activeTask);
    const newIndex = containers[target].indexOf(overTask);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return null;
    containers[source] = arrayMove(containers[source], oldIndex, newIndex);
  } else {
    containers[source] = containers[source].filter((id) => id !== activeTask);
    const targetIds = containers[target];
    const insertionIndex = overTask ? Math.max(0, targetIds.indexOf(overTask)) : targetIds.length;
    targetIds.splice(insertionIndex, 0, activeTask);
  }
  return { ...layout, containers };
}

interface SortableTaskProps {
  task: TaskResponseDto;
  selected: boolean;
  expanded: boolean;
  onRowClick: () => void;
  onToggleComplete: () => void;
}

function SortableTask({
  task,
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
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <TaskItem
        task={task}
        selectionState={expanded ? 'expanded' : selected ? 'selected' : 'idle'}
        onRowClick={onRowClick}
        onToggleComplete={onToggleComplete}
      />
    </div>
  );
}

interface TaskContainerProps {
  id: ContainerId;
  taskIds: string[];
  taskMap: Map<string, TaskResponseDto>;
  selectedId: string | null;
  expandedId: string | null;
  onRowClick: (id: string) => void;
  onToggleComplete: (task: TaskResponseDto) => void;
}

function TaskContainer({
  id,
  taskIds,
  taskMap,
  selectedId,
  expandedId,
  onRowClick,
  onToggleComplete,
}: TaskContainerProps) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId(id) });
  return (
    <SortableContext items={taskIds.map(taskId)} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={cn('min-h-8 rounded-md transition-colors', isOver && 'bg-muted/60')}
      >
        {taskIds.map((id) => {
          const task = taskMap.get(id);
          if (!task) return null;
          return (
            <SortableTask
              key={id}
              task={task}
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
  const [layout, setLayout] = React.useState(() => normalizeLayout(tasks, headings));
  const taskMap = React.useMemo(
    () => new Map(tasks.filter((task) => !task.parentId).map((task) => [task.id, task])),
    [tasks],
  );
  const headingMap = React.useMemo(
    () => new Map(headings.map((heading) => [heading.id, heading])),
    [headings],
  );
  const { selectedId, expandedId, handleRowClick, handleBlankClick } = useTaskRowSelection();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const saveLayout = useReorderProjectHeadingLayout();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  React.useEffect(() => {
    setLayout(normalizeLayout(tasks, headings));
  }, [tasks, headings]);

  const toggleComplete = (task: TaskResponseDto) => {
    const mutation = task.status === 'COMPLETED' ? uncompleteTask : completeTask;
    mutation.mutate(task.id, {
      onError: () => toast.error(t('common:operationFailed')),
    });
  };

  const persist = (next: LayoutState) => {
    setLayout(next);
    saveLayout.mutate(serializeLayout(projectId, next), {
      onError: () => {
        setLayout(normalizeLayout(tasks, headings));
        toast.error(t('common:saveFailed'));
      },
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const next = applyLayoutDrag(layout, String(active.id), String(over.id));
    if (next) persist(next);
  };

  const commonContainerProps = {
    taskMap,
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
        </DndContext>
      )}
    </div>
  );
}

export { applyLayoutDrag, normalizeLayout, serializeLayout };
