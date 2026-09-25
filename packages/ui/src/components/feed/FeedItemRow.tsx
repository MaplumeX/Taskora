import type { FeedItem, TaskFeedItem } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from '@/components/task/TaskItem';
import { ProjectFeedRow } from './ProjectFeedRow';
import { SettledDateBadge } from './SettledDateBadge';
import type { SelectionState } from '@taskora/api';

interface Props {
  item: FeedItem;
  projectTitle?: string;
  areaTitle?: string;
  selectionState?: SelectionState;
  onToggleComplete?: () => void;
  onRowClick?: () => void;
  showScheduledBadge?: boolean;
  /** Logbook 场景：显示行内了却日期 */
  showSettledDate?: boolean;
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
  showScheduledBadge,
  showSettledDate = false,
}: Props) {
  if (!isTaskFeedItem(item)) {
    return (
      <ProjectFeedRow
        item={item}
        showScheduledBadge={showScheduledBadge}
        selectionState={selectionState}
        settledDateBadge={
          showSettledDate && item.completedAt ? (
            <SettledDateBadge date={item.completedAt} className="text-primary" />
          ) : undefined
        }
      />
    );
  }

  // TaskFeedItem is a subset of TaskResponseDto (missing `subtasks`).
  // TaskItem internally fetches live data via useTaskQuery(task.id) which
  // includes subtasks. When the live data is still loading, TaskItem falls
  // back to the `task` prop — so we provide `subtasks: []` as a default.
  const task = {
    ...item,
    subtasks: [],
  } as TaskResponseDto;

  return (
    <TaskItem
      task={task}
      projectTitle={projectTitle}
      areaTitle={areaTitle}
      selectionState={selectionState}
      onToggleComplete={onToggleComplete ?? (() => {})}
      onRowClick={onRowClick}
      showScheduledBadge={showScheduledBadge}
      settledDateBadge={
        showSettledDate && item.completedAt ? (
          <SettledDateBadge date={item.completedAt} className="text-primary" />
        ) : undefined
      }
    />
  );
}
