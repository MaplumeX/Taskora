import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toDateKey } from './date';
import {
  addMonths,
  buildMonthCells,
  buildWeekdayLabels,
  groupByScheduledDate,
} from './calendarGrid';

function localNoonIso(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day, 12).toISOString();
}

function task(id: string, scheduledDate: string | null): TaskResponseDto {
  return {
    id,
    title: id,
    notes: null,
    scheduledDate,
    scheduledType: ScheduledType.DATE,
    reminderTime: null,
    repeatRule: null,
    dueDate: null,
    bucket: TaskBucket.INBOX,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
    projectId: null,
    headingId: null,
    areaId: null,
    tags: [],
    subtasks: [],
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  };
}

describe('addMonths', () => {
  it('does not skip short months when navigating from a 31st', () => {
    // Jan 31 + 1 month must land in February, not March 3
    const next = addMonths(new Date(2026, 0, 31), 1);
    expect(next.getMonth()).toBe(1); // February
    expect(next.getFullYear()).toBe(2026);
  });

  it('wraps across year boundaries in both directions', () => {
    expect(addMonths(new Date(2026, 11, 31), 1).getFullYear()).toBe(2027);
    expect(addMonths(new Date(2026, 0, 15), -1).getFullYear()).toBe(2025);
    expect(addMonths(new Date(2026, 0, 15), -1).getMonth()).toBe(11);
  });

  it('normalizes the day to the 1st (safe in-month anchor)', () => {
    expect(addMonths(new Date(2026, 7, 30), 1).getDate()).toBe(1);
    expect(addMonths(new Date(2026, 7, 30), -1).getMonth()).toBe(6);
  });
});

describe('buildMonthCells', () => {
  it('returns exactly 42 cells', () => {
    expect(buildMonthCells(new Date(2026, 7, 15))).toHaveLength(42);
  });

  it('starts on the configured week start (Monday default)', () => {
    // 2026-08-01 is a Saturday → grid starts Monday 2026-07-27
    const cells = buildMonthCells(new Date(2026, 7, 15));
    expect(cells[0].getFullYear()).toBe(2026);
    expect(cells[0].getMonth()).toBe(6); // July
    expect(cells[0].getDate()).toBe(27);
    expect(cells[0].getDay()).toBe(1); // Monday
  });

  it('ends on a Sunday and covers the full anchor month', () => {
    const cells = buildMonthCells(new Date(2026, 7, 15));
    const last = cells[cells.length - 1];
    expect(last.getDay()).toBe(0); // Sunday
    expect(last.getFullYear()).toBe(2026);
    expect(last.getMonth()).toBe(8); // September
    expect(last.getDate()).toBe(6);
    // every day of August appears
    for (let day = 1; day <= 31; day++) {
      expect(cells.some((c) => c.getMonth() === 7 && c.getDate() === day)).toBe(true);
    }
  });

  it('supports Sunday week start', () => {
    // 2026-08-01 is a Saturday → Sunday-start grid begins 2026-08-02? No:
    // Sunday start means grid begins on the Sunday on/before Aug 1 → 2026-07-26
    const cells = buildMonthCells(new Date(2026, 7, 15), 0);
    expect(cells[0].getDay()).toBe(0);
    expect(cells[0].getDate()).toBe(26);
    expect(cells[0].getMonth()).toBe(6);
  });

  it('cells are consecutive days', () => {
    const cells = buildMonthCells(new Date(2025, 1, 10));
    for (let i = 1; i < cells.length; i++) {
      const diff =
        (cells[i].getTime() - cells[i - 1].getTime()) / 86_400_000;
      expect(diff).toBe(1);
    }
  });
});

describe('groupByScheduledDate', () => {
  // 固定「今天」为 2026-09-25（周五），使「逾期归入今天」的行为可断言。
  // 日期 key 一律经 toDateKey 推导（月份参数按人类惯例 1-12），避免手工
  // 写 key 与 JS Date 的 0 基月份错位。
  const todayKey = () => toDateKey(new Date());

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function localNoonKey(year: number, month: number, day: number): string {
    return toDateKey(new Date(year, month - 1, day, 12));
  }

  it('groups tasks by local-date key of scheduledDate', () => {
    const map = groupByScheduledDate([
      task('a', localNoonIso(2026, 9, 30)),
      task('b', localNoonIso(2026, 9, 30)),
      task('c', localNoonIso(2026, 10, 1)),
    ]);
    expect(map.get(localNoonKey(2026, 9, 30))?.map((t) => t.id)).toEqual(['a', 'b']);
    expect(map.get(localNoonKey(2026, 10, 1))?.map((t) => t.id)).toEqual(['c']);
    expect(map.size).toBe(2);
  });

  it('keeps keys stable regardless of scheduledDate time-of-day (local date)', () => {
    // 23:00 local on the 30th — must still key to the 30th, not roll to UTC 31st
    const lateEvening = new Date(2026, 8, 30, 23, 30).toISOString();
    const map = groupByScheduledDate([task('late', lateEvening)]);
    expect(map.has(toDateKey(new Date(2026, 8, 30, 23, 30)))).toBe(true);
  });

  it('skips tasks without scheduledDate', () => {
    const map = groupByScheduledDate([task('a', null), task('b', localNoonIso(2026, 9, 30))]);
    expect(map.size).toBe(1);
    expect(map.has(localNoonKey(2026, 9, 30))).toBe(true);
  });

  it('rolls past dates into today（参考 Things 3：When 永不逾期）', () => {
    const map = groupByScheduledDate([
      task('yesterday', localNoonIso(2026, 9, 24)),
      task('lastWeek', localNoonIso(2026, 9, 18)),
      task('today', localNoonIso(2026, 9, 25)),
      task('future', localNoonIso(2026, 9, 26)),
    ]);
    expect(map.get(todayKey())?.map((t) => t.id)).toEqual(['yesterday', 'lastWeek', 'today']);
    expect(map.get(localNoonKey(2026, 9, 26))?.map((t) => t.id)).toEqual(['future']);
    expect(map.size).toBe(2);
    expect(map.has(localNoonKey(2026, 9, 24))).toBe(false);
  });

  it('returns empty map for empty input', () => {
    expect(groupByScheduledDate([]).size).toBe(0);
  });
});

describe('buildWeekdayLabels', () => {
  it('starts with Monday label by default', () => {
    const zh = buildWeekdayLabels('zh-CN');
    expect(zh).toHaveLength(7);
    // second label should be Tuesday's
    const en = buildWeekdayLabels('en-US');
    expect(en).toHaveLength(7);
    // Labels for en-US short weekdays; order is weekStart..weekStart+6
    const monday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(
      new Date(2024, 0, 8),
    );
    expect(en[0]).toBe(monday);
  });

  it('starts with Sunday label when weekStartsOn=0', () => {
    const en = buildWeekdayLabels('en-US', 0);
    const sunday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(
      new Date(2024, 0, 7),
    );
    expect(en[0]).toBe(sunday);
  });

  it('yields single-letter labels with narrow style', () => {
    const en = buildWeekdayLabels('en-US', 1, 'narrow');
    const monday = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(
      new Date(2024, 0, 8),
    );
    expect(en[0]).toBe(monday);
    expect(en).toHaveLength(7);
  });
});
