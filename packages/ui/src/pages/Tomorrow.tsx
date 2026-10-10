import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  startOfTomorrow,
  toDateKey,
  toInputDateValue,
  useCalendarDay,
  useEffectiveTags,
  useFeedQuery,
} from '@taskora/api';
import { ScheduledType } from '@taskora/shared';

import { TimeViewFeedList } from '@/components/feed/TimeViewFeedList';
import { PageHeading } from '@/components/layout/PageHeading';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';

/**
 * Tomorrow（对齐 Things 3 的隐藏列表）：Upcoming 中计划日期为明天的任务与
 * 项目，即 Upcoming「明天」一节的同一批条目。只从 Quick Find 进入；展示
 * 同 Today（按偏好分组或平铺、可拖拽排序），行上不重复显示日期。
 */
export default function Tomorrow() {
  const { t } = useTranslation();
  const calendarDay = useCalendarDay();
  const { data: upcoming = [], isLoading, isError } = useFeedQuery('upcoming');
  const items = useMemo(() => {
    const tomorrow = toInputDateValue(startOfTomorrow());
    return upcoming.filter(
      (item) =>
        item.scheduledType === ScheduledType.DATE &&
        item.scheduledDate !== null &&
        toDateKey(item.scheduledDate) === tomorrow,
    );
  }, [upcoming, calendarDay]);
  const effectiveTags = useEffectiveTags();
  const { visible, filtering, bar } = useTagFilter(items, effectiveTags.ofFeedItem);

  return (
    <div className="flex flex-col gap-4">
      <PageHeading nav="/tomorrow">{t('nav:tomorrow')}</PageHeading>
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <TimeViewFeedList
          items={visible}
          showScheduledBadge={false}
          emptyHint={filtering ? t('tag:filterEmpty') : t('task:tomorrowEmpty')}
        />
      )}
    </div>
  );
}
