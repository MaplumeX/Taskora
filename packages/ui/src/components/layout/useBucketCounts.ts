import { useFeedQuery } from '@taskora/api';

/**
 * Inbox / Today 两个 Bucket 视图的条目数，用于导航角标。
 *
 * 复用 feed 查询缓存（与页面相同的 query key），因此不会产生额外请求；
 * 后端这两个视图均只返回 ACTIVE 条目，length 即剩余条目数。
 */
export function useBucketCounts() {
  const { data: inbox = [] } = useFeedQuery('inbox');
  const { data: today = [] } = useFeedQuery('today');
  return { inboxCount: inbox.length, todayCount: today.length };
}
