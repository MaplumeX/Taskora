import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePreferencesStore } from '@taskora/api';
import type { FeedItem } from '@taskora/shared';

import { useBucketCounts } from './useBucketCounts';

const feeds = vi.hoisted(() => ({ inbox: [] as unknown[], today: [] as unknown[] }));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeedQuery: (view: 'inbox' | 'today') => ({ data: feeds[view] }),
}));

const item = (id: string, dueDate: string | null) => ({ id, type: 'task', dueDate }) as FeedItem;

const originalZone = usePreferencesStore.getState().timeZone;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 上海已是 9-24
  vi.setSystemTime(new Date('2026-09-23T17:00:00.000Z'));
  usePreferencesStore.getState().setTimeZone('Asia/Shanghai');
});
afterEach(() => {
  vi.useRealTimers();
  usePreferencesStore.setState({ timeZone: originalZone });
});

describe('useBucketCounts：Today 拆成红色（截止日期已到）与灰色（其余）', () => {
  it('截止日期 ≤ 今天计入红色，其余计入灰色，两数之和为 Today 总数', () => {
    feeds.inbox = [item('i1', null)];
    feeds.today = [
      item('due-today', '2026-09-24'),
      item('overdue', '2026-09-20'),
      item('due-later', '2026-09-30'),
      item('no-deadline', null),
    ];
    const { result } = renderHook(() => useBucketCounts());
    expect(result.current).toEqual({ inboxCount: 1, todayDueCount: 2, todayCount: 2 });
  });

  it('没有到期条目时红色为 0', () => {
    feeds.today = [item('a', null), item('b', '2026-09-25')];
    const { result } = renderHook(() => useBucketCounts());
    expect(result.current.todayDueCount).toBe(0);
    expect(result.current.todayCount).toBe(2);
  });
});
