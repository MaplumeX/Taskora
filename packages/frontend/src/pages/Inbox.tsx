import { useTranslation } from 'react-i18next';

import { useTasksQuery } from '@/lib/hooks/useTasks';
import { TaskListView } from '@/components/task/TaskListView';

export default function Inbox() {
  const { t } = useTranslation();
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ view: 'inbox' });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t('nav:inbox')}</h1>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common:loading')}</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">{t('common:loadFailed')}</p>
      ) : (
        <TaskListView tasks={tasks} emptyHint={t('task:inboxEmpty')} />
      )}
    </div>
  );
}