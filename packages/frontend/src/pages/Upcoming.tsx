import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

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
import { toDateKey } from '@/lib/utils/date';
import { i18n } from '@/i18n/config';
import { toast } from 'sonner';

export default function Upcoming() {
  const { t } = useTranslation();
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ view: 'upcoming' });
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
    else completeTask.mutate(task.id, { onError: () => toast.error(t('common:operationFailed')) });
  };

  const handleTrash = (task: TaskResponseDto) => {
    deleteTask.mutate(task.id, {
      onSuccess: () => toast.success(t('task:movedToTrash')),
      onError: () => toast.error(t('common:deleteFailed')),
    });
  };

  return (
    <div className="flex flex-col gap-4" onClick={handleBlankClick}>
      <h1 className="text-xl font-semibold tracking-tight">{t('nav:upcoming')}</h1>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common:loading')}</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">{t('common:loadFailed')}</p>
      ) : grouped.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('task:upcomingEmpty')}</p>
      ) : (
        grouped.map(([dateKey, group]) => (
          <div key={dateKey} className="flex flex-col gap-1">
            <h2 className="px-2 pb-1 pt-4 text-sm font-medium text-muted-foreground">
              {new Intl.DateTimeFormat(i18n.language, {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              }).format(new Date(dateKey))}
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
        ))
      )}
    </div>
  );
}