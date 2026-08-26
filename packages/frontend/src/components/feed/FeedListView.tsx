import { useMemo } from 'react';
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

import type { FeedItem } from '@taskora/shared';

import { FeedItemRow } from './FeedItemRow';
import type { SelectionState } from '@/lib/hooks/useTaskRowSelection';
import { useCompleteTask, useReorderTasks, useUncompleteTask } from '@/lib/hooks/useTasks';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useAreasQuery } from '@/lib/hooks/useAreas';
import { useTaskRowSelection } from '@/lib/hooks/useTaskRowSelection';
import { toast } from 'sonner';

interface Props {
  items: FeedItem[];
  emptyHint?: string;
  sortable?: boolean;
}

interface SortableFeedItemRowProps {
  item: FeedItem;
  projectTitle?: string;
  areaTitle?: string;
  selectionState: SelectionState;
  onToggleComplete: () => void;
  onRowClick?: () => void;
}

function SortableFeedItemRow({
  item,
  projectTitle,
  areaTitle,
  selectionState,
  onToggleComplete,
  onRowClick,
}: SortableFeedItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

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

export function FeedListView({ items, emptyHint, sortable }: Props) {
  const { t } = useTranslation();
  const { handleRowClick, handleBlankClick, selectedId, expandedId } =
    useTaskRowSelection();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const reorderTasks = useReorderTasks();
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );
  const areaMap = useMemo(
    () => Object.fromEntries(areas.map((a) => [a.id, a.title])),
    [areas],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const topItems = items;

  if (topItems.length === 0) {
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

  const handleToggle = (item: FeedItem) => {
    if (item.type === 'task') {
      if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
      else {
        completeTask.mutate(item.id, {
          onError: () => toast.error(t('common:operationFailed')),
        });
      }
    }
    // Projects don't have inline complete toggle in feed list
  };

  const renderItems = () =>
    topItems.map((item) => {
      const selectionState: SelectionState =
        expandedId === item.id ? 'expanded' : selectedId === item.id ? 'selected' : 'idle';
      const isTask = item.type === 'task';
      const taskItem = item as { projectId: string | null; areaId: string | null };
      const props = {
        item,
        projectTitle: isTask && taskItem.projectId ? projectMap[taskItem.projectId] : undefined,
        areaTitle: isTask && taskItem.areaId ? areaMap[taskItem.areaId] : undefined,
        selectionState,
        onToggleComplete: () => handleToggle(item),
        onRowClick: isTask ? () => handleRowClick(item.id) : undefined,
      };

      if (sortable && isTask) {
        return <SortableFeedItemRow key={item.id} {...props} />;
      }
      return <FeedItemRow key={item.id} {...props} />;
    });

  if (!sortable) {
    return (
      <div className="flex flex-col" onClick={handleBlankClick}>
        {renderItems()}
      </div>
    );
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Only tasks are sortable in feed; collect task ids
    const ids = topItems.filter((i) => i.type === 'task').map((i) => i.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(ids, oldIndex, newIndex);
    reorderTasks.mutate(reordered);
  };

  return (
    <div className="flex flex-col" onClick={handleBlankClick}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={topItems.filter((i) => i.type === 'task').map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col">{renderItems()}</div>
        </SortableContext>
      </DndContext>
    </div>
  );
}