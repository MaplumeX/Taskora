import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import type { FeedItem, UserResponseDto } from '@taskora/shared';

import * as usersApi from '@/api/users.api';
import { usePreferencesStore } from '@/stores/preferences.store';
import { useUiInteractionStore } from '@/stores/uiInteraction.store';

import {
  acknowledgeNewInToday,
  isNewInToday,
  markNewInTodaySeen,
  newInTodayKeys,
  useNewInTodayKeys,
} from './useNewInToday';

function item(
  type: 'task' | 'project',
  id: string,
  scheduledDate: string | null,
  scheduledSetAt?: string | null,
): FeedItem {
  return { type, id, scheduledDate, scheduledSetAt } as FeedItem;
}

const initial = usePreferencesStore.getState();
let persist: MockInstance<typeof usersApi.updatePreferences>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T04:00:00Z'));
  usePreferencesStore.setState({
    timeZone: 'Asia/Shanghai',
    todayReviewedOn: '2026-10-07',
    todaySeenKeys: [],
  });
  persist = vi
    .spyOn(usersApi, 'updatePreferences')
    .mockResolvedValue({ preferences: null } as unknown as UserResponseDto);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  useUiInteractionStore.setState({ expandedId: null });
  usePreferencesStore.setState({
    timeZone: initial.timeZone,
    todayReviewedOn: initial.todayReviewedOn,
    todaySeenKeys: initial.todaySeenKeys,
  });
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

describe('截止日期到来（截止日期 ≤ 今天也进 Today）', () => {
  // 今天是上海 10-09，已确认到 10-07
  const due = (
    id: string,
    dueDate: string,
    dueSetAt?: string | null,
    scheduledDate: string | null = null,
  ) => ({ type: 'task', id, scheduledDate, dueDate, dueSetAt }) as FeedItem;

  it('截止日期提前设好、日期到来：新到', () => {
    expect(isNewInToday(due('a', '2026-10-09', '2026-10-01T00:00:00.000Z'), '2026-10-07')).toBe(
      true,
    );
    // 写入时刻未知：只按基线
    expect(isNewInToday(due('a', '2026-10-08'), '2026-10-07')).toBe(true);
  });

  it('当天才把截止日期设成今天、或截止日期早于已确认日期：不算', () => {
    // 上海 10-09 08:00 才设
    expect(isNewInToday(due('a', '2026-10-09', '2026-10-09T00:00:00.000Z'), '2026-10-07')).toBe(
      false,
    );
    expect(isNewInToday(due('a', '2026-10-05'), '2026-10-07')).toBe(false);
  });

  it('计划日期在以后、截止日期今天到：按截止日期算；计划日期的未来日期本身不算', () => {
    expect(isNewInToday(due('a', '2026-10-09', null, '2026-10-20'), '2026-10-07')).toBe(true);
    expect(isNewInToday(due('a', '2026-10-05', null, '2026-10-20'), '2026-10-07')).toBe(false);
  });

  it('两条路径都成立时已读键用计划日期；改截止日期后新的截止日到来再算新到', () => {
    const both = due('a', '2026-10-09', null, '2026-10-08');
    expect(newInTodayKeys([both], '2026-10-07', ['task:a@2026-10-08']).size).toBe(0);
    expect(newInTodayKeys([due('b', '2026-10-08')], '2026-10-07', ['task:b@2026-10-08']).size).toBe(
      0,
    );
    // 已读后截止日期改到 10-09，再次到来
    expect(newInTodayKeys([due('b', '2026-10-09')], '2026-10-07', ['task:b@2026-10-08']).size).toBe(
      1,
    );
  });
});

describe('单条已读与确认', () => {
  const items = [
    item('task', 't1', '2026-10-08'),
    item('task', 't2', '2026-10-09'),
    item('project', 'p1', '2026-10-09'),
  ];

  it('excludes seen items until they arrive again on another date', () => {
    expect([...newInTodayKeys(items, '2026-10-07', ['task:t1@2026-10-08'])]).toEqual([
      'task:t2',
      'project:p1',
    ]);
    // 改期后再次到来：已读键带旧日期，不再覆盖。
    expect(
      newInTodayKeys([item('task', 't1', '2026-10-09')], '2026-10-07', ['task:t1@2026-10-08']).size,
    ).toBe(1);
  });

  it('marks one item seen, then confirms everything once the last one is read', () => {
    const { result } = renderHook(() => useNewInTodayKeys(items));
    expect(result.current.size).toBe(3);

    act(() => markNewInTodaySeen('task', 't1'));
    expect([...result.current]).toEqual(['task:t2', 'project:p1']);
    expect(persist).toHaveBeenLastCalledWith({
      todayReviewedOn: '2026-10-07',
      todaySeenKeys: ['task:t1@2026-10-08'],
    });
    // 非新到条目：无操作。
    act(() => markNewInTodaySeen('task', 'other'));
    expect(persist).toHaveBeenCalledTimes(1);

    act(() => markNewInTodaySeen('project', 'p1'));
    act(() => markNewInTodaySeen('task', 't2'));
    expect(result.current.size).toBe(0);
    expect(usePreferencesStore.getState()).toMatchObject({
      todayReviewedOn: '2026-10-09',
      todaySeenKeys: [],
    });
    expect(persist).toHaveBeenLastCalledWith({ todayReviewedOn: '2026-10-09', todaySeenKeys: [] });
  });

  it('expanding a fresh task marks it seen', () => {
    const { result } = renderHook(() => useNewInTodayKeys(items));
    act(() => useUiInteractionStore.getState().setExpandedId('t2'));
    expect(result.current.has('task:t2')).toBe(false);
    expect(result.current.size).toBe(2);
  });

  it('acknowledging clears every dot; visiting Today alone does not', () => {
    const { result, unmount } = renderHook(() => useNewInTodayKeys(items));
    unmount();
    expect(usePreferencesStore.getState().todayReviewedOn).toBe('2026-10-07');

    const second = renderHook(() => useNewInTodayKeys(items));
    expect(second.result.current.size).toBe(3);
    act(() => acknowledgeNewInToday());
    expect(second.result.current.size).toBe(0);
    expect(result.current.size).toBe(3); // 已卸载的旧结果不再更新
    expect(usePreferencesStore.getState().todayReviewedOn).toBe('2026-10-09');
  });

  it('starts the baseline on the first Today visit', () => {
    usePreferencesStore.setState({ todayReviewedOn: null });
    const { result } = renderHook(() => useNewInTodayKeys(items));
    expect(result.current.size).toBe(0);
    expect(usePreferencesStore.getState().todayReviewedOn).toBe('2026-10-09');
  });
});
