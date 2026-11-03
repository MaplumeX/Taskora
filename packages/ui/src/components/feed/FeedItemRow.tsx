import * as React from 'react';
import type { FeedItem, TaskFeedItem } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from '@/components/task/TaskItem';
import type { ScheduledBadgeMode } from '@/components/task/TaskDateBadge';
import { ProjectFeedRow } from './ProjectFeedRow';
import { SettledDateBadge } from './SettledDateBadge';
import type { SelectionState } from '@taskora/api';

interface Props {
  item: FeedItem;
  projectTitle?: string;
  areaTitle?: string;
  /** 分组视图不显示展开任务的外侧归属入口。 */
  hidePlacement?: boolean;
  selectionState?: SelectionState;
  onToggleComplete?: () => void;
  onRowClick?: () => void;
  showScheduledBadge?: ScheduledBadgeMode;
  /** Logbook 场景：显示行内了却日期 */
  showSettledDate?: boolean;
  /** New in Today 新到条目：行首左侧黄点。 */
  newInToday?: boolean;
}

function isTaskFeedItem(item: FeedItem): item is TaskFeedItem {
  return item.type === 'task';
}

const noop = () => {};

/** memo 同 TaskItem：这里每次渲染都会新建 task，须在此层就跳过。 */
export const FeedItemRow = React.memo(function FeedItemRow({
  item,
  projectTitle,
  areaTitle,
  hidePlacement,
  selectionState = 'idle',
  onToggleComplete,
  onRowClick,
  showScheduledBadge,
  showSettledDate = false,
  newInToday = false,
}: Props) {
  if (!isTaskFeedItem(item)) {
    return (
      <ProjectFeedRow
        item={item}
        showScheduledBadge={showScheduledBadge}
        selectionState={selectionState}
        newInToday={newInToday}
        plainSettledTitle={showSettledDate}
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
      hidePlacement={hidePlacement}
      selectionState={selectionState}
      onToggleComplete={onToggleComplete ?? noop}
      onRowClick={onRowClick}
      showScheduledBadge={showScheduledBadge}
      newInToday={newInToday}
      plainSettledTitle={showSettledDate}
      settledDateBadge={
        showSettledDate && item.completedAt ? (
          <SettledDateBadge date={item.completedAt} className="text-primary" />
        ) : undefined
      }
    />
  );
});
