import type { FeedItem } from '@taskora/shared';

import { toDateKey, todayDateKey, useCalendarDay, useFeedQuery } from '@taskora/api';

/** 截止日期已到（今天或已过）的条目：Today 入口的红色计数。 */
export function isDeadlineReached(item: Pick<FeedItem, 'dueDate'>, today: string): boolean {
  return item.dueDate !== null && toDateKey(item.dueDate) <= today;
}

/**
 * Inbox / Today 两个 Bucket 视图的条目数，用于导航角标。Today 拆成两个数
 * （对齐 Things 3）：todayDueCount 为截止日期 ≤ 今天的条目（红色），
 * todayCount 为其余条目（灰色），两数之和即 Today 总条数。
 *
 * 复用 feed 查询缓存（与页面相同的 query key），因此不会产生额外请求；
 * 后端这两个视图均只返回 ACTIVE 条目，length 即剩余条目数。
 */
export function useBucketCounts() {
  useCalendarDay();
  const { data: inbox = [] } = useFeedQuery('inbox');
  const { data: today = [] } = useFeedQuery('today');
  const todayKey = todayDateKey();
  const todayDueCount = today.filter((item) => isDeadlineReached(item, todayKey)).length;
  return { inboxCount: inbox.length, todayCount: today.length - todayDueCount, todayDueCount };
}
