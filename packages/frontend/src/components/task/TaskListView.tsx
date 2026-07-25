import { useMemo } from 'react';

import type { TaskResponseDto } from '@taskora/shared';

import { TaskList } from './TaskList';
import { useCompleteTask, useDeleteTask, useUncompleteTask } from '@/lib/hooks/useTasks';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useAreasQuery } from '@/lib/hooks/useAreas';
import { useTaskRowSelection } from '@/lib/hooks/useTaskRowSelection';
import { toast } from 'sonner';

interface Props {
  tasks: TaskResponseDto[];
  emptyHint?: string;
}

export function TaskListView({ tasks, emptyHint }: Props) {
  const { handleRowClick, handleBlankClick, selectedId, expandedId } =
    useTaskRowSelection();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const deleteTask = useDeleteTask();
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
        onError: () => toast.error('操作失败'),
      });
    }
  };

  const handleTrash = (task: TaskResponseDto) => {
    deleteTask.mutate(task.id, {
      onSuccess: () => toast.success('已移到废纸篓'),
      onError: () => toast.error('删除失败'),
    });
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
        onTrash={handleTrash}
        emptyHint={emptyHint}
      />
    </div>
  );
}