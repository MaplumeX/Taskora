import { useEffect, useMemo } from 'react';

import { instantDateKey, todaySeenKey, type FeedItem } from '@taskora/shared';

import { updatePreferences } from '@/api/users.api';
import { useFeedQuery } from '@/hooks/useFeed';
import { hydrateFromServer, usePreferencesStore } from '@/stores/preferences.store';
import { useUiInteractionStore } from '@/stores/uiInteraction.store';
import { currentTimeZone, toDateKey, todayDateKey } from '@/utils/date';
import { useCalendarDay } from './useCalendarDay';

type NewInTodayItem = Pick<
  FeedItem,
  'type' | 'id' | 'scheduledDate' | 'scheduledSetAt' | 'dueDate' | 'dueSetAt'
>;

/**
 * 某个日期字段让条目「随日期到来」进入 Today：日期已到（≤ 今天）、晚于
 * 「最近一次确认的日期」，且该字段在这天之前就写好了（setAt 的日历日早于
 * 它）。当天才设成今天（或已过日期）的是手动放进来的，不算；写入时刻未知
 * （旧数据）时只按基线判断。
 */
function arrivedOn(
  date: string | null | undefined,
  setAt: string | null | undefined,
  reviewedOn: string,
  today: string,
): string | null {
  if (!date) return null;
  const day = toDateKey(date);
  if (day > today || day <= reviewedOn) return null;
  if (setAt && instantDateKey(setAt, currentTimeZone()) >= day) return null;
  return day;
}

/**
 * 让条目成为新到的那个日期，不是新到为 null。计划日期、截止日期两条路径
 * 任一成立即可，都成立时取计划日期（单条已读键按它记）。基线缺失（从未
 * 看过）不算。
 */
function newInTodayDate(item: NewInTodayItem, reviewedOn: string | null): string | null {
  if (reviewedOn === null) return null;
  const today = todayDateKey();
  return (
    arrivedOn(item.scheduledDate, item.scheduledSetAt, reviewedOn, today) ??
    arrivedOn(item.dueDate, item.dueSetAt, reviewedOn, today)
  );
}

/**
 * New in Today（新到）：Today 中上次确认之后才**随日期到来**进入的任务/
 * 项目（参考 Things 3 的黄色 new in Today 圆点）——计划日期或截止日期
 * 到来，规则见 arrivedOn。
 */
export function isNewInToday(item: NewInTodayItem, reviewedOn: string | null): boolean {
  return newInTodayDate(item, reviewedOn) !== null;
}

/** 新到条目的单条已读键：按让它进入 Today 的那个日期记；不是新到为 null。 */
function seenKeyOf(item: NewInTodayItem, reviewedOn: string | null): string | null {
  const day = newInTodayDate(item, reviewedOn);
  return day === null ? null : todaySeenKey(item.type, item.id, day);
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
      .filter((item) => {
        const key = seenKeyOf(item, reviewedOn);
        return key !== null && !seen.has(key);
      })
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
        return keys.has(feedKey) ? [[feedKey, seenKeyOf(item, reviewedOn)!] as const] : [];
      }),
    );
  }, [items, keys, reviewedOn]);

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
