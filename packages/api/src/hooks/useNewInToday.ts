import { useEffect, useMemo } from 'react';

import { instantDateKey, todaySeenKey, type FeedItem } from '@taskora/shared';

import { updatePreferences } from '@/api/users.api';
import { useFeedQuery } from '@/hooks/useFeed';
import { hydrateFromServer, usePreferencesStore } from '@/stores/preferences.store';
import { useUiInteractionStore } from '@/stores/uiInteraction.store';
import { currentTimeZone, toDateKey, todayDateKey } from '@/utils/date';
import { useCalendarDay } from './useCalendarDay';

/**
 * New in Today（新到）：Today 中上次确认之后才**随日期到来**进入的任务/
 * 项目（参考 Things 3 的黄色 new in Today 圆点）：
 * - 计划日期晚于「最近一次确认的日期」；基线缺失（从未看过）不算；
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

type NewInTodayItem = Pick<FeedItem, 'type' | 'id' | 'scheduledDate' | 'scheduledSetAt'>;

/** 条目的单条已读键（新到条目都有计划日期）。 */
function seenKeyOf(item: NewInTodayItem): string {
  return todaySeenKey(item.type, item.id, toDateKey(item.scheduledDate!));
}

/**
 * 未读新到条目的 feed 键（`task:<id>` / `project:<id>`）：新到且不在单条
 * 已读集合中。
 */
export function newInTodayKeys(
  items: NewInTodayItem[],
  reviewedOn: string | null,
  seenKeys: readonly string[] = [],
): Set<string> {
  const seen = new Set(seenKeys);
  return new Set(
    items
      .filter((item) => isNewInToday(item, reviewedOn) && !seen.has(seenKeyOf(item)))
      .map((item) => `${item.type}:${item.id}`),
  );
}

/** 本地状态写回账号偏好（失败保留本地，下次写入时一并带上）。 */
function persistNewInToday(): void {
  const { todayReviewedOn, todaySeenKeys } = usePreferencesStore.getState();
  if (todayReviewedOn === null) return;
  updatePreferences({ todayReviewedOn, todaySeenKeys })
    .then((user) => hydrateFromServer(user.preferences))
    .catch(() => {});
}

/**
 * 当前未读的新到条目（feed 键 → 单条已读键），由挂载着的新到 hook 维护，
 * 供只知道 id 的入口（展开、编辑）标记已读。
 */
let unread = new Map<string, string>();

/** 全部确认（横幅「好」）：已确认日期推进到今天，单条已读随之清空。 */
export function acknowledgeNewInToday(): void {
  if (!usePreferencesStore.getState().markTodayReviewed(todayDateKey())) return;
  unread = new Map();
  persistNewInToday();
}

/**
 * 单条已读：展开 / 打开、编辑、拖拽排序某个新到条目时调用；非新到条目
 * 无操作。逐条读完（未读归零）等同全部确认。
 */
export function markNewInTodaySeen(type: FeedItem['type'], id: string): void {
  const feedKey = `${type}:${id}`;
  const seenKey = unread.get(feedKey);
  if (seenKey === undefined) return;
  unread = new Map(unread);
  unread.delete(feedKey);
  if (unread.size === 0) {
    acknowledgeNewInToday();
    return;
  }
  if (usePreferencesStore.getState().markTodaySeen([seenKey])) persistNewInToday();
}

/** Today 中未读新到条目的 feed 键，并维护未读登记与展开即已读。 */
function useUnreadNewInToday(items: FeedItem[]): Set<string> {
  const calendarDay = useCalendarDay();
  const reviewedOn = usePreferencesStore((s) => s.todayReviewedOn);
  const seenKeys = usePreferencesStore((s) => s.todaySeenKeys);
  const keys = useMemo(
    () => newInTodayKeys(items, reviewedOn, seenKeys),
    [items, reviewedOn, seenKeys, calendarDay],
  );

  useEffect(() => {
    unread = new Map(
      items.flatMap((item) => {
        const feedKey = `${item.type}:${item.id}`;
        return keys.has(feedKey) ? [[feedKey, seenKeyOf(item)] as const] : [];
      }),
    );
  }, [items, keys]);

  // 展开任务（任一视图、任一入口）即已读。
  useEffect(
    () =>
      useUiInteractionStore.subscribe((state, prev) => {
        if (state.expandedId && state.expandedId !== prev.expandedId) {
          markNewInTodaySeen('task', state.expandedId);
        }
      }),
    [],
  );

  return keys;
}

/**
 * Today 页：未读新到条目的键（行首黄点；条数即横幅的 X）。从未确认过时
 * 以今天为起点（此时没有可标的新到），之后只在确认时推进。
 */
export function useNewInTodayKeys(items: FeedItem[]): Set<string> {
  useEffect(() => {
    if (usePreferencesStore.getState().todayReviewedOn === null) acknowledgeNewInToday();
  }, []);
  return useUnreadNewInToday(items);
}

/** 侧边栏 / 手机首页：Today 中是否有未读的新到条目。 */
export function useHasNewInToday(): boolean {
  const { data: items = [] } = useFeedQuery('today');
  return useUnreadNewInToday(items).size > 0;
}
