import { useTranslation } from 'react-i18next';

import { useFeedQuery } from '@taskora/api';
import { TimeViewFeedList } from '@/components/feed/TimeViewFeedList';

export default function Someday() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('someday');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{t('nav:someday')}</h1>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <TimeViewFeedList view="someday" items={items} emptyHint={t('task:somedayEmpty')} />
      )}
    </div>
  );
}
