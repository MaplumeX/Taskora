import * as React from 'react';

import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from '@/components/task/TaskItem';
import { TaskDetail } from '@/components/task/TaskDetail';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import {
  useCompleteTask,
  useDeleteTask,
  useUncompleteTask,
} from '@/lib/hooks/useTasks';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useAreasQuery } from '@/lib/hooks/useAreas';
import { toDateKey } from '@/lib/utils/date';
import { toast } from 'sonner';

export default function Upcoming() {
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ view: 'upcoming' });
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const deleteTask = useDeleteTask();
  const [selected, setSelected] = React.useState<TaskResponseDto | null>(null);
  const [open, setOpen] = React.useState(false);

  const projectMap = React.useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );
  const areaMap = React.useMemo(
    () => Object.fromEntries(areas.map((a) => [a.id, a.title])),
    [areas],
  );

  const grouped = React.useMemo(() => {
    const map = new Map<string, TaskResponseDto[]>();
    for (const t of tasks) {
      if (t.parentId) continue;
      if (!t.scheduledDate) continue;
      const key = toDateKey(t.scheduledDate);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);

  const toggleComplete = (task: TaskResponseDto) => {
    if (task.status === 'COMPLETED') uncompleteTask.mutate(task.id);
    else completeTask.mutate(task.id, { onError: () => toast.error('操作失败') });
  };

  const handleTrash = (task: TaskResponseDto) => {
    deleteTask.mutate(task.id, {
      onSuccess: () => toast.success('已移到废纸篓'),
      onError: () => toast.error('删除失败'),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Upcoming</h1>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">加载失败</p>
      ) : grouped.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">没有即将到来的任务</p>
      ) : (
        grouped.map(([dateKey, group]) => (
          <div key={dateKey} className="flex flex-col gap-1">
            <h2 className="px-2 pb-1 pt-4 text-sm font-medium text-muted-foreground">
              {new Date(dateKey).toLocaleDateString('zh-CN', {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              })}
            </h2>
            {group.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                projectTitle={task.projectId ? projectMap[task.projectId] : undefined}
                areaTitle={task.areaId ? areaMap[task.areaId] : undefined}
                onToggleComplete={() => toggleComplete(task)}
                onOpenDetail={() => {
                  setSelected(task);
                  setOpen(true);
                }}
                onTrash={() => handleTrash(task)}
              />
            ))}
          </div>
        ))
      )}
      <TaskDetail task={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}