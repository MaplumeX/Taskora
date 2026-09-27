import { useTranslation } from 'react-i18next';

import { useFeedQuery } from '@taskora/api';
import { TimeViewFeedList } from '@/components/feed/TimeViewFeedList';
import { PageHeading } from '@/components/layout/PageHeading';

export default function Someday() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('someday');

  return (
    <div className="flex flex-col gap-4">
      <PageHeading nav="/someday">{t('nav:someday')}</PageHeading>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <TimeViewFeedList items={items} emptyHint={t('task:somedayEmpty')} />
      )}
    </div>
  );
}
