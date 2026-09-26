import { useCalendarDay, useFeedQuery, todayDateKey } from '@taskora/api';
import { useTranslation } from 'react-i18next';

import { TimeViewFeedList } from '@/components/feed/TimeViewFeedList';

const todayISO = todayDateKey;

export default function Today() {
  useCalendarDay();
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('today');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{t('nav:today')}</h1>
      <p className="text-sm text-muted-foreground tabular-nums">{todayISO()}</p>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        // Today 视图本身即日期语境,行上省略日期标记(逾期任务同此——
        // When 永不逾期,一律按「今天」对待,参考 Things 3)。
        <TimeViewFeedList
          items={items}
          emptyHint={t('task:todayEmpty')}
          showScheduledBadge={false}
        />
      )}
    </div>
  );
}
