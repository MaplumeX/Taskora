import { useTranslation } from 'react-i18next';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from './TaskItem';
import type { SelectionState } from '@/lib/hooks/useTaskRowSelection';

interface ProjectLookup {
  [projectId: string]: string;
}
interface AreaLookup {
  [areaId: string]: string;
}

interface Props {
  tasks: TaskResponseDto[];
  projects?: ProjectLookup;
  areas?: AreaLookup;
  selectedId?: string | null;
  expandedId?: string | null;
  onRowClick?: (id: string) => void;
  onToggleComplete: (task: TaskResponseDto) => void;
  onReorder?: (orderedIds: string[]) => void;
  sortable?: boolean;
  emptyHint?: string;
}

interface SortableTaskItemProps {
  task: TaskResponseDto;
  projectTitle?: string;
  areaTitle?: string;
  selectionState: SelectionState;
  onToggleComplete: () => void;
  onRowClick?: () => void;
}

function SortableTaskItem({
  task,
  projectTitle,
  areaTitle,
  selectionState,
  onToggleComplete,
  onRowClick,
}: SortableTaskItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <TaskItem
        task={task}
        projectTitle={projectTitle}
        areaTitle={areaTitle}
        selectionState={selectionState}
        onToggleComplete={onToggleComplete}
        onRowClick={onRowClick}
      />
    </div>
  );
}

export function TaskList({
  tasks,
  projects = {},
  areas = {},
  selectedId,
  expandedId,
  onRowClick,
  onToggleComplete,
onReorder,
  sortable = true,
  emptyHint,
}: Props) {
  const { t } = useTranslation();
  const topTasks = tasks;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  if (topTasks.length === 0) {
    return (
      <div className="mt-12 flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <svg
            className="h-5 w-5 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <p className="font-display text-base font-semibold text-muted-foreground">
          {emptyHint ?? t('task:empty')}
        </p>
      </div>
    );
  }

  const renderItems = () =>
    topTasks.map((task) => {
      const selectionState: SelectionState =
        expandedId === task.id ? 'expanded' : selectedId === task.id ? 'selected' : 'idle';
      const itemProps = {
        task,
        projectTitle: task.projectId ? projects[task.projectId] : undefined,
        areaTitle: task.areaId ? areas[task.areaId] : undefined,
        selectionState,
        onToggleComplete: () => onToggleComplete(task),
        onRowClick: onRowClick ? () => onRowClick(task.id) : undefined,
      };

      if (sortable && onReorder) {
        return <SortableTaskItem key={task.id} {...itemProps} />;
      }
      return <TaskItem key={task.id} {...itemProps} />;
    });

  if (!sortable || !onReorder) {
    return <div className="flex flex-col">{renderItems()}</div>;
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = topTasks.map((t) => t.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    const reordered = arrayMove(ids, oldIndex, newIndex);
    onReorder(reordered);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={topTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col">{renderItems()}</div>
      </SortableContext>
    </DndContext>
  );
}