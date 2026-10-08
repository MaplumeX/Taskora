import { useDraggable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { ProjectResponseDto } from '@taskora/shared';

import type { SelectionState } from '@taskora/api';
import { ProjectFeedRow } from '@/components/feed/ProjectFeedRow';
import { cn } from '@/lib/utils';

interface Props {
  project: ProjectResponseDto;
  selectionState: SelectionState;
  showScheduledBadge?: boolean;
}

/** 可拖拽排序（也可拖到侧边栏）的项目行；须放在 SortableContext 内。 */
export function SortableProjectRow({ project, selectionState, showScheduledBadge }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      // 被拖行由 DragOverlay 跟手（才能拖到侧边栏），原行留作不可见的空位。
      className={cn(isDragging && 'invisible')}
      {...attributes}
      {...listeners}
    >
      <ProjectFeedRow
        item={project}
        selectionState={selectionState}
        showScheduledBadge={showScheduledBadge}
      />
    </div>
  );
}

/** 只能拖到侧边栏、不参与列表内排序的项目行。 */
export function DraggableProjectRow({ project, selectionState, showScheduledBadge }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: project.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(isDragging && 'invisible')}
      {...attributes}
      {...listeners}
    >
      <ProjectFeedRow
        item={project}
        selectionState={selectionState}
        showScheduledBadge={showScheduledBadge}
      />
    </div>
  );
}
