import { useTranslation } from 'react-i18next';

import { useTasksQuery } from '@/lib/hooks/useTasks';
import { useDelayedLoading } from '@/lib/hooks/useDelayedLoading';
import { TaskListView } from '@/components/task/TaskListView';
import { TaskListSkeleton } from '@/components/task/TaskListSkeleton';

export default function Anytime() {
  const { t } = useTranslation();
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ view: 'anytime' });
  const showSkeleton = useDelayedLoading(isLoading);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{t('nav:anytime')}</h1>
      {showSkeleton ? (
        <TaskListSkeleton />
      ) : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <TaskListView tasks={tasks} emptyHint={t('task:anytimeEmpty')} />
      )}
    </div>
  );
}