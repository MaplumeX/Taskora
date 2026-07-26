import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from '@/components/task/TaskItem';
import { TaskListSkeleton } from '@/components/task/TaskListSkeleton';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { useDelayedLoading } from '@/lib/hooks/useDelayedLoading';
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
  const { t } = useTranslation();
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ view: 'logbook' });
  const showSkeleton = useDelayedLoading(isLoading);
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
    else completeTask.mutate(task.id, { onError: () => toast.error(t('common:operationFailed')) });
  };

  const handleTrash = (task: TaskResponseDto) => {
    deleteTask.mutate(task.id, {
      onSuccess: () => toast.success(t('task:movedToTrash')),
      onError: () => toast.error(t('common:deleteFailed')),
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
      <h1 className="text-xl font-semibold tracking-tight">{t('nav:logbook')}</h1>
      {showSkeleton ? (
        <TaskListSkeleton />
      ) : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : !hasAny ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('task:logbookEmpty')}</p>
      ) : (
        <>
          {renderGroup(t('common:today'), grouped.today)}
          {renderGroup(t('task:yesterday'), grouped.yesterday)}
          {renderGroup(t('task:earlier'), grouped.earlier)}
        </>
      )}
    </div>
  );
}