import { beforeEach, describe, expect, it } from 'vitest';

import type { FeedItem } from '@taskora/shared';

import { usePreferencesStore } from '@/stores/preferences.store';

import { isNewInToday, newInTodayKeys } from './useNewInToday';

function item(
  type: 'task' | 'project',
  id: string,
  scheduledDate: string | null,
  scheduledSetAt?: string | null,
): FeedItem {
  return { type, id, scheduledDate, scheduledSetAt } as FeedItem;
}

beforeEach(() => {
  usePreferencesStore.setState({ timeZone: 'Asia/Shanghai' });
});

describe('isNewInToday', () => {
  it('marks items whose scheduled date is after the last Today review', () => {
    expect(isNewInToday(item('task', 'a', '2026-10-06'), '2026-10-05')).toBe(true);
    // 上次查看当天或之前就已在 Today：不算新到。
    expect(isNewInToday(item('task', 'a', '2026-10-05'), '2026-10-05')).toBe(false);
    expect(isNewInToday(item('task', 'a', '2026-10-01'), '2026-10-05')).toBe(false);
  });

  it('only marks items that were scheduled before their date arrived', () => {
    // 前一天（账号时区）排好、随日期到来：新到。
    expect(
      isNewInToday(item('task', 'a', '2026-10-06', '2026-10-05T15:59:00.000Z'), '2026-10-05'),
    ).toBe(true);
    // 当天（上海 10-06 00:01）才手动排到今天：不算。
    expect(
      isNewInToday(item('task', 'a', '2026-10-06', '2026-10-05T16:01:00.000Z'), '2026-10-05'),
    ).toBe(false);
    // 排到已过的日期：不算。
    expect(
      isNewInToday(item('task', 'a', '2026-10-06', '2026-10-07T01:00:00.000Z'), '2026-10-05'),
    ).toBe(false);
    // 写入时刻未知（旧数据）：只按基线。
    expect(isNewInToday(item('task', 'a', '2026-10-06', null), '2026-10-05')).toBe(true);
  });

  it('marks nothing before the first review or without a scheduled date', () => {
    expect(isNewInToday(item('task', 'a', '2026-10-06'), null)).toBe(false);
    expect(isNewInToday(item('task', 'a', null), '2026-10-05')).toBe(false);
  });

  it('keys tasks and projects by feed key', () => {
    const keys = newInTodayKeys(
      [
        item('task', 't1', '2026-10-06'),
        item('task', 't2', '2026-10-04'),
        item('project', 'p1', '2026-10-06'),
      ],
      '2026-10-05',
    );
    expect([...keys]).toEqual(['task:t1', 'project:p1']);
  });
});
