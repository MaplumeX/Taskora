import type { FeedItem, TaskFeedItem } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from '@/components/task/TaskItem';
import { ProjectFeedRow } from './ProjectFeedRow';
import type { SelectionState } from '@/lib/hooks/useTaskRowSelection';

interface Props {
  item: FeedItem;
  projectTitle?: string;
  areaTitle?: string;
  selectionState?: SelectionState;
  onToggleComplete?: () => void;
  onRowClick?: () => void;
}

function isTaskFeedItem(item: FeedItem): item is TaskFeedItem {
  return item.type === 'task';
}

export function FeedItemRow({
  item,
  projectTitle,
  areaTitle,
  selectionState = 'idle',
  onToggleComplete,
  onRowClick,
}: Props) {
  if (!isTaskFeedItem(item)) {
    return <ProjectFeedRow item={item} />;
  }

  // TaskFeedItem is a subset of TaskResponseDto (missing `children`).
  // TaskItem internally fetches live data via useTaskQuery(task.id) which
  // includes children. When the live data is still loading, TaskItem falls
  // back to the `task` prop — so we provide `children: []` as a default.
  const task = {
    ...item,
    children: [],
  } as TaskResponseDto;

  return (
    <TaskItem
      task={task}
      projectTitle={projectTitle}
      areaTitle={areaTitle}
      selectionState={selectionState}
      onToggleComplete={onToggleComplete ?? (() => {})}
      onRowClick={onRowClick}
    />
  );
}