import { useTranslation } from 'react-i18next';

import { useFeedQuery } from '@taskora/api';
import { TimeViewFeedList } from '@/components/feed/TimeViewFeedList';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Today() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('today');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{t('nav:today')}</h1>
      <p className="text-sm text-muted-foreground tabular-nums">{todayISO()}</p>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        // Today 视图本身即日期语境,省略行首日期 chip(逾期任务仍显示红色 chip)。
        <TimeViewFeedList
          view="today"
          items={items}
          emptyHint={t('task:todayEmpty')}
          showScheduledBadge={false}
        />
      )}
    </div>
  );
}
