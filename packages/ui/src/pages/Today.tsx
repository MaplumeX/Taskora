import {
  acknowledgeNewInToday,
  useCalendarDay,
  useCalendarEvents,
  useEffectiveTags,
  useFeedQuery,
  useNewInTodayKeys,
  todayDateKey,
  upcomingDateRange,
} from '@taskora/api';
import { useTranslation } from 'react-i18next';

import { CalendarEventList } from '@/components/calendar/CalendarEventRow';
import { TimeViewFeedList } from '@/components/feed/TimeViewFeedList';
import { PageHeading } from '@/components/layout/PageHeading';
import { NewInTodayBanner } from '@/components/task/NewInTodayBanner';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';

const todayISO = todayDateKey;

export default function Today() {
  useCalendarDay();
  const today = todayISO();
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('today');
  const effectiveTags = useEffectiveTags();
  const { visible, filtering, bar } = useTagFilter(items, effectiveTags.ofFeedItem);
  // New in Today：未读新到条目留在原位、行首带黄点；横幅「好」全部确认。
  const freshKeys = useNewInTodayKeys(items);
  // 日历订阅的日程（ADR 0023）：与 Upcoming 同一查询区间，共用缓存
  const eventRange = upcomingDateRange(today);
  const events = useCalendarEvents(eventRange.from, eventRange.to).get(today) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeading nav="/today">{t('nav:today')}</PageHeading>
      <p className="text-sm text-muted-foreground tabular-nums">{today}</p>
      {!isLoading && !isError && (
        <NewInTodayBanner count={freshKeys.size} onAcknowledge={acknowledgeNewInToday} />
      )}
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {/* 只读日程排在任务之前；按 Tag 过滤时隐藏（日程没有 Tag） */}
      {!filtering && <CalendarEventList entries={events} now={Date.now()} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        // Today 视图本身即日期语境,行上省略黄星(计划日期已过的任务同此——
        // When 永不逾期,一律按「今天」对待,参考 Things 3);截止日期带进来、
        // 计划在以后的条目仍显示灰色日期 chip。
        <TimeViewFeedList
          items={visible}
          emptyHint={filtering ? t('tag:filterEmpty') : t('task:todayEmpty')}
          showScheduledBadge="future"
          freshKeys={freshKeys}
        />
      )}
    </div>
  );
}
