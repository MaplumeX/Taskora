import { useTranslation } from 'react-i18next';

import { useFeedQuery } from '@/lib/hooks/useFeed';
import { useDelayedLoading } from '@/lib/hooks/useDelayedLoading';
import { FeedListView } from '@/components/feed/FeedListView';
import { TaskListSkeleton } from '@/components/task/TaskListSkeleton';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Today() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('today');
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
        <FeedListView items={items} emptyHint={t('task:todayEmpty')} />
      )}
    </div>
  );
}