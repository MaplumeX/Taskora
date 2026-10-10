import { SETTLED_TASK_STATUSES, type FeedItem, type TaskStatus } from '@taskora/shared';

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
 * 复用 feed 查询缓存（与页面相同的 query key），因此不会产生额外请求。
 * 只数未了结的条目：每天 / 手动模式下视图里还有尚未移入 Logbook 的已了结
 * 条目（Logging Mode），它们已经不是待办。
 */
export function useBucketCounts() {
  useCalendarDay();
  const { data: inboxFeed = [] } = useFeedQuery('inbox');
  const { data: todayFeed = [] } = useFeedQuery('today');
  const inbox = inboxFeed.filter((item) => !isSettled(item));
  const today = todayFeed.filter((item) => !isSettled(item));
  const todayKey = todayDateKey();
  const todayDueCount = today.filter((item) => isDeadlineReached(item, todayKey)).length;
  return { inboxCount: inbox.length, todayCount: today.length - todayDueCount, todayDueCount };
}

function isSettled(item: Pick<FeedItem, 'status'>): boolean {
  return SETTLED_TASK_STATUSES.includes(item.status as TaskStatus);
}
