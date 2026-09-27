import { useTranslation } from 'react-i18next';

import { useFeedQuery } from '@taskora/api';
import { FeedListView } from '@/components/feed/FeedListView';
import { PageHeading } from '@/components/layout/PageHeading';

export default function Inbox() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('inbox');

  return (
    <div className="flex flex-col gap-4">
      <PageHeading nav="/inbox">{t('nav:inbox')}</PageHeading>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <FeedListView items={items} emptyHint={t('task:inboxEmpty')} />
      )}
    </div>
  );
}