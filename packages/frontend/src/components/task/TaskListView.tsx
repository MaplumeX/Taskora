import * as React from 'react';

import type { TaskResponseDto } from '@taskora/shared';

import { TaskDetail } from './TaskDetail';
import { TaskList } from './TaskList';
import { useCompleteTask, useDeleteTask, useUncompleteTask } from '@/lib/hooks/useTasks';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useAreasQuery } from '@/lib/hooks/useAreas';
import { toast } from 'sonner';

interface Props {
  tasks: TaskResponseDto[];
  emptyHint?: string;
}

/** Bundles TaskList + TaskDetail dialog and standard interactions. */
export function TaskListView({ tasks, emptyHint }: Props) {
  const [selected, setSelected] = React.useState<TaskResponseDto | null>(null);
  const [open, setOpen] = React.useState(false);
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const deleteTask = useDeleteTask();
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();

  const projectMap = React.useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );
  const areaMap = React.useMemo(
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

  const handleOpen = (task: TaskResponseDto) => {
    setSelected(task);
    setOpen(true);
  };

  return (
    <>
      <TaskList
        tasks={tasks}
        projects={projectMap}
        areas={areaMap}
        onToggleComplete={handleToggle}
        onOpenDetail={handleOpen}
        onTrash={handleTrash}
        emptyHint={emptyHint}
      />
      <TaskDetail task={selected} open={open} onOpenChange={setOpen} />
    </>
  );
}