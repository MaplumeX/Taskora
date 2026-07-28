import { useTranslation } from 'react-i18next';

import { useFeedQuery } from '@/lib/hooks/useFeed';
import { useDelayedLoading } from '@/lib/hooks/useDelayedLoading';
import { FeedListView } from '@/components/feed/FeedListView';
import { TaskListSkeleton } from '@/components/task/TaskListSkeleton';

export default function Inbox() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('inbox');
  const showSkeleton = useDelayedLoading(isLoading);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{t('nav:inbox')}</h1>
      {showSkeleton ? (
        <TaskListSkeleton />
      ) : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <FeedListView items={items} emptyHint={t('task:inboxEmpty')} />
      )}
    </div>
  );
}