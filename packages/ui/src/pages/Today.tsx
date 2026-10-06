import {
  useCalendarDay,
  useEffectiveTags,
  useFeedQuery,
  useNewInTodayKeys,
  todayDateKey,
} from '@taskora/api';
import { useTranslation } from 'react-i18next';

import { TimeViewFeedList } from '@/components/feed/TimeViewFeedList';
import { PageHeading } from '@/components/layout/PageHeading';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';

const todayISO = todayDateKey;

export default function Today() {
  useCalendarDay();
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('today');
  const effectiveTags = useEffectiveTags();
  const { visible, filtering, bar } = useTagFilter(items, effectiveTags.ofFeedItem);
  // New in Today：上次查看后新到的条目置顶并带黄点，离开本页后消除。
  const freshKeys = useNewInTodayKeys(items);

  return (
    <div className="flex flex-col gap-4">
      <PageHeading nav="/today">{t('nav:today')}</PageHeading>
      <p className="text-sm text-muted-foreground tabular-nums">{todayISO()}</p>
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        // Today 视图本身即日期语境,行上省略日期标记(逾期任务同此——
        // When 永不逾期,一律按「今天」对待,参考 Things 3)。
        <TimeViewFeedList
          items={visible}
          emptyHint={filtering ? t('tag:filterEmpty') : t('task:todayEmpty')}
          showScheduledBadge={false}
          freshKeys={freshKeys}
        />
      )}
    </div>
  );
}
