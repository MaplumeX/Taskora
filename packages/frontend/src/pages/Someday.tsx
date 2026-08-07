import { useTranslation } from 'react-i18next';

import { useFeedQuery } from '@/lib/hooks/useFeed';
import { FeedListView } from '@/components/feed/FeedListView';

export default function Someday() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('someday');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{t('nav:someday')}</h1>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <FeedListView items={items} emptyHint={t('task:somedayEmpty')} />
      )}
    </div>
  );
}