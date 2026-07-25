import { useMemo } from 'react';

import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from '@/components/task/TaskItem';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import {
  useCompleteTask,
  useDeleteTask,
  useUncompleteTask,
} from '@/lib/hooks/useTasks';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useAreasQuery } from '@/lib/hooks/useAreas';
import { useTaskRowSelection } from '@/lib/hooks/useTaskRowSelection';
import { dayDiff } from '@/lib/utils/date';
import { toast } from 'sonner';

export default function Logbook() {
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ view: 'logbook' });
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const deleteTask = useDeleteTask();
  const {
    selectedId,
    expandedId,
    handleRowClick,
    handleBlankClick,
  } = useTaskRowSelection();

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );
  const areaMap = useMemo(
    () => Object.fromEntries(areas.map((a) => [a.id, a.title])),
    [areas],
  );

  const grouped = useMemo(() => {
    const today: TaskResponseDto[] = [];
    const yesterday: TaskResponseDto[] = [];
    const earlier: TaskResponseDto[] = [];
    for (const t of tasks) {
      if (t.parentId) continue;
      if (!t.completedAt) continue;
      const diff = dayDiff(t.completedAt, new Date());
      if (diff === 0) today.push(t);
      else if (diff === 1) yesterday.push(t);
      else earlier.push(t);
    }
    return { today, yesterday, earlier };
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

  const renderGroup = (label: string, group: TaskResponseDto[]) => {
    if (group.length === 0) return null;
    return (
      <div key={label} className="flex flex-col gap-1">
        <h2 className="px-2 pb-1 pt-4 text-sm font-medium text-muted-foreground">
          {label}
        </h2>
        {group.map((task) => {
          const selectionState =
            expandedId === task.id ? 'expanded' : selectedId === task.id ? 'selected' : 'idle';
          return (
            <TaskItem
              key={task.id}
              task={task}
              projectTitle={task.projectId ? projectMap[task.projectId] : undefined}
              areaTitle={task.areaId ? areaMap[task.areaId] : undefined}
              selectionState={selectionState}
              onToggleComplete={() => toggleComplete(task)}
              onRowClick={() => handleRowClick(task.id)}
              onTrash={() => handleTrash(task)}
            />
          );
        })}
      </div>
    );
  };

  const hasAny =
    grouped.today.length + grouped.yesterday.length + grouped.earlier.length > 0;

  return (
    <div className="flex flex-col gap-4" onClick={handleBlankClick}>
      <h1 className="text-2xl font-semibold tracking-tight">Logbook</h1>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">加载失败</p>
      ) : !hasAny ? (
        <p className="py-8 text-center text-sm text-muted-foreground">还没有已完成的任务</p>
      ) : (
        <>
          {renderGroup('今天', grouped.today)}
          {renderGroup('昨天', grouped.yesterday)}
          {renderGroup('更早', grouped.earlier)}
        </>
      )}
    </div>
  );
}