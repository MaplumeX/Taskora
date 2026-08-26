import { useTranslation } from 'react-i18next';

import { useFeedQuery } from '@/lib/hooks/useFeed';
import { FeedListView } from '@/components/feed/FeedListView';

export default function Inbox() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('inbox');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{t('nav:inbox')}</h1>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <FeedListView items={items} emptyHint={t('task:inboxEmpty')} />
      )}
    </div>
  );
}