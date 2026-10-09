import { useEffect, useMemo, useState } from 'react';

import { instantDateKey, type FeedItem } from '@taskora/shared';

import { updatePreferences } from '@/api/users.api';
import { useFeedQuery } from '@/hooks/useFeed';
import { hydrateFromServer, usePreferencesStore } from '@/stores/preferences.store';
import { currentTimeZone, toDateKey, todayDateKey } from '@/utils/date';
import { useCalendarDay } from './useCalendarDay';

/**
 * New in Today（新到）：Today 中上次看过 Today 之后才**随日期到来**进入
 * 的任务/项目（参考 Things 3 的黄色 new in Today 圆点）：
 * - 计划日期晚于「最近一次查看 Today 的日期」；基线缺失（从未看过）不算；
 * - 且排期发生在计划日期之前（scheduledSetAt 的日历日早于计划日期）。
 *   当天才排到今天（或排到已过日期）的是手动放进来的，不算新到；写入时刻
 *   未知（旧数据）时只按基线判断。
 * Today feed 里的条目计划日期都已 ≤ 今天。
 */
export function isNewInToday(
  item: Pick<FeedItem, 'scheduledDate' | 'scheduledSetAt'>,
  reviewedOn: string | null,
): boolean {
  if (reviewedOn === null || !item.scheduledDate) return false;
  const day = toDateKey(item.scheduledDate);
  if (day <= reviewedOn) return false;
  if (!item.scheduledSetAt) return true;
  return instantDateKey(item.scheduledSetAt, currentTimeZone()) < day;
}

/** 新到条目的 feed 键（`task:<id>` / `project:<id>`）。 */
export function newInTodayKeys(items: FeedItem[], reviewedOn: string | null): Set<string> {
  return new Set(
    items.filter((item) => isNewInToday(item, reviewedOn)).map((item) => `${item.type}:${item.id}`),
  );
}

/** 推进已看基线到今天：本地立即生效，再写回账号偏好（失败保留本地，下次再写）。 */
function markTodayReviewed(): void {
  const today = todayDateKey();
  if (!usePreferencesStore.getState().markTodayReviewed(today)) return;
  updatePreferences({ todayReviewedOn: today })
    .then((user) => hydrateFromServer(user.preferences))
    .catch(() => {});
}

/**
 * Today 页：返回本次访问中应带黄点的条目键。基线在进入时取快照，进入即
 * 把已看日期推进到今天（侧边栏黄点随之消失、其他设备同步清除），本次
 * 访问内黄点保留，离开 Today 后不再出现。停留跨过零点时离开再推进一次。
 */
export function useNewInTodayKeys(items: FeedItem[]): Set<string> {
  const calendarDay = useCalendarDay();
  const [baseline] = useState(() => usePreferencesStore.getState().todayReviewedOn);
  useEffect(() => {
    markTodayReviewed();
    return markTodayReviewed;
  }, []);
  return useMemo(() => newInTodayKeys(items, baseline), [items, baseline, calendarDay]);
}

/** 侧边栏：Today 中是否有尚未看过的新到条目。 */
export function useHasNewInToday(): boolean {
  const calendarDay = useCalendarDay();
  const { data: items = [] } = useFeedQuery('today');
  const reviewedOn = usePreferencesStore((s) => s.todayReviewedOn);
  return useMemo(
    () => items.some((item) => isNewInToday(item, reviewedOn)),
    [items, reviewedOn, calendarDay],
  );
}
