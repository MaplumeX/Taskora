import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { TaskResponseDto } from '@taskora/shared';

import { TaskList } from './TaskList';
import {
  useCompleteTask,
  useReorderTasks,
  useUncancelTask,
  useUncompleteTask,
} from '@taskora/api';
import { useProjectsQuery } from '@taskora/api';
import { useAreasQuery } from '@taskora/api';
import { useSelectionScope } from '@taskora/api';
import { useTaskRowSelection } from '@taskora/api';
import { toast } from 'sonner';

interface Props {
  tasks: TaskResponseDto[];
  emptyHint?: string;
  /** 为空时不渲染任何空状态（用于区域详情等自身不展示空态的页面）。 */
  hideEmptyState?: boolean;
  /** 页头已表达归属的页面（区域详情）不在行上重复归属小字。 */
  hideOwnership?: boolean;
  sortable?: boolean;
  /** 同页多个列表时，该列表在键盘遍历中的先后（见 useSelectionScope）。 */
  selectionRank?: number;
}

export function TaskListView({
  tasks,
  emptyHint,
  hideEmptyState,
  hideOwnership,
  sortable,
  selectionRank,
}: Props) {
  const { t } = useTranslation();
  const { handleRowClick, handleBlankClick, selectedIds, expandedId } =
    useTaskRowSelection();
  // 注册当前可见行为全局键盘 Selection 的可遍历序列（ADR-0004）。
  const rows = useMemo(
    () =>
      tasks.map((task) => ({
        id: task.id,
        kind: 'task' as const,
        completed: task.status === 'COMPLETED',
        cancelled: task.status === 'CANCELLED',
        tagIds: (task.tags ?? []).map((tag) => tag.id),
      })),
    [tasks],
  );
  useSelectionScope(rows, selectionRank);
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const uncancelTask = useUncancelTask();
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

  const handleToggle = (task: TaskResponseDto) => {
    // 撤销了结（尚未移入 Logbook 的条目还在这里）：已取消 → 撤销取消
    if (task.status === 'CANCELLED') uncancelTask.mutate(task.id);
    else if (task.status === 'COMPLETED') uncompleteTask.mutate(task.id);
    else {
      completeTask.mutate(task.id, {
        onError: () => toast.error(t('common:operationFailed')),
      });
    }
  };

  return (
    <div className="flex flex-col" onClick={handleBlankClick}>
      <TaskList
        tasks={tasks}
        projects={projectMap}
        areas={areaMap}
        selectedIds={selectedIds}
        expandedId={expandedId}
        onRowClick={handleRowClick}
        onToggleComplete={handleToggle}
        onReorder={(ids) => reorderTasks.mutate(ids)}
        sortable={sortable}
        emptyHint={emptyHint}
        hideEmptyState={hideEmptyState}
        hideOwnership={hideOwnership}
      />
    </div>
  );
}
