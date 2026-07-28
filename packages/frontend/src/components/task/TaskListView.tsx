import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { TaskResponseDto } from '@taskora/shared';

import { TaskList } from './TaskList';
import { useCompleteTask, useReorderTasks, useUncompleteTask } from '@/lib/hooks/useTasks';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useAreasQuery } from '@/lib/hooks/useAreas';
import { useTaskRowSelection } from '@/lib/hooks/useTaskRowSelection';
import { toast } from 'sonner';

interface Props {
  tasks: TaskResponseDto[];
  emptyHint?: string;
  sortable?: boolean;
}

export function TaskListView({ tasks, emptyHint, sortable }: Props) {
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

  const handleToggle = (task: TaskResponseDto) => {
    if (task.status === 'COMPLETED') uncompleteTask.mutate(task.id);
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
        selectedId={selectedId}
        expandedId={expandedId}
        onRowClick={handleRowClick}
        onToggleComplete={handleToggle}
        onReorder={(ids) => reorderTasks.mutate(ids)}
        sortable={sortable}
        emptyHint={emptyHint}
      />
    </div>
  );
}