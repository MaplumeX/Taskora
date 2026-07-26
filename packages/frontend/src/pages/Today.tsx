import { useTranslation } from 'react-i18next';

import { useTasksQuery } from '@/lib/hooks/useTasks';
import { useDelayedLoading } from '@/lib/hooks/useDelayedLoading';
import { TaskListView } from '@/components/task/TaskListView';
import { TaskListSkeleton } from '@/components/task/TaskListSkeleton';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Today() {
  const { t } = useTranslation();
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ view: 'today' });
  const showSkeleton = useDelayedLoading(isLoading);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{t('nav:today')}</h1>
      <p className="text-sm text-muted-foreground">{todayISO()}</p>
      {showSkeleton ? (
        <TaskListSkeleton />
      ) : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <TaskListView tasks={tasks} emptyHint={t('task:todayEmpty')} />
      )}
    </div>
  );
}