import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type { FeedItem } from '@taskora/shared';
import { describe, expect, it } from 'vitest';

import { buildUpcomingLayout } from './upcomingLayout';

function localNoonIso(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day, 12).toISOString();
}

function task(id: string, scheduledDate: string | null): FeedItem {
  return {
    id,
    type: 'task',
    title: id,
    notes: null,
    scheduledDate,
    scheduledType: scheduledDate ? ScheduledType.DATE : ScheduledType.NONE,
    dueDate: null,
    status: TaskStatus.ACTIVE,
    bucket: TaskBucket.SCHEDULED,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
    tags: [],
    projectId: null,
    headingId: null,
    areaId: null,
  };
}

describe('buildUpcomingLayout', () => {
  it('AC1: today Jul 29 labels week days 30, 31, 8.1…8.5', () => {
    const layout = buildUpcomingLayout([], new Date(2026, 6, 29));

    expect(layout.week).toHaveLength(7);
    expect(layout.week.map((day) => day.dateKey)).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ]);
    expect(layout.week.map((day) => day.numberLabel)).toEqual([
      '30',
      '31',
      '8.1',
      '8.2',
      '8.3',
      '8.4',
      '8.5',
    ]);
    expect(layout.week[0].isTomorrow).toBe(true);
    expect(layout.week.slice(1).every((day) => day.isTomorrow === false)).toBe(true);
  });

  it('AC2/AC4: today Aug 26 week labels and later 9/3-9/30, Oct, Nov', () => {
    const layout = buildUpcomingLayout([], new Date(2026, 7, 26));

    expect(layout.week.map((day) => day.dateKey)).toEqual([
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
    expect(layout.week.map((day) => day.numberLabel)).toEqual([
      '27',
      '28',
      '29',
      '30',
      '31',
      '9.1',
      '9.2',
    ]);
    expect(layout.later).toHaveLength(3);
    expect(layout.later[0]).toMatchObject({
      year: 2026,
      month: 9,
      headingKind: 'range',
      rangeStartDay: 3,
      rangeEndDay: 30,
      showYear: false,
    });
    expect(layout.later[1]).toMatchObject({
      year: 2026,
      month: 10,
      headingKind: 'name',
      rangeStartDay: null,
      rangeEndDay: null,
      showYear: false,
    });
    expect(layout.later[2]).toMatchObject({
      year: 2026,
      month: 11,
      headingKind: 'name',
      rangeStartDay: null,
      rangeEndDay: null,
      showYear: false,
    });
    expect(layout.later.every((month) => month.days.length === 0)).toBe(true);
  });

  it('AC3: today Jul 31 later headings are 8/8-8/31, Sep, Oct', () => {
    const layout = buildUpcomingLayout([], new Date(2026, 6, 31));

    expect(layout.week.map((day) => day.numberLabel)).toEqual([
      '8.1',
      '8.2',
      '8.3',
      '8.4',
      '8.5',
      '8.6',
      '8.7',
    ]);
    expect(layout.later).toHaveLength(3);
    expect(layout.later[0]).toMatchObject({
      year: 2026,
      month: 8,
      headingKind: 'range',
      rangeStartDay: 8,
      rangeEndDay: 31,
      showYear: false,
    });
    expect(layout.later[1]).toMatchObject({
      year: 2026,
      month: 9,
      headingKind: 'name',
      rangeStartDay: null,
      rangeEndDay: null,
      showYear: false,
    });
    expect(layout.later[2]).toMatchObject({
      year: 2026,
      month: 10,
      headingKind: 'name',
      rangeStartDay: null,
      rangeEndDay: null,
      showYear: false,
    });
  });

  it('AC5: today Aug 24 later months are name headings Sep, Oct, Nov', () => {
    const layout = buildUpcomingLayout([], new Date(2026, 7, 24));

    expect(layout.week.map((day) => day.dateKey)).toEqual([
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
      '2026-08-31',
    ]);
    expect(layout.later).toHaveLength(3);
    expect(layout.later.map((month) => month.month)).toEqual([9, 10, 11]);
    expect(layout.later.every((month) => month.headingKind === 'name')).toBe(true);
    expect(layout.later.every((month) => month.rangeStartDay === null)).toBe(true);
    expect(layout.later.every((month) => month.rangeEndDay === null)).toBe(true);
    expect(layout.later.every((month) => month.showYear === false)).toBe(true);
  });

  it('AC8: Aug 12 task on Jul 31 sits under 8/8-8/31 with label 8.12', () => {
    const item = task('aug-12', localNoonIso(2026, 8, 12));
    const layout = buildUpcomingLayout([item], new Date(2026, 6, 31));

    expect(layout.week.every((day) => day.items.length === 0)).toBe(true);
    expect(layout.later[0].days).toHaveLength(1);
    expect(layout.later[0].days[0].dateKey).toBe('2026-08-12');
    expect(layout.later[0].days[0].numberLabel).toBe('8.12');
    expect(layout.later[0].days[0].isTomorrow).toBe(false);
    expect(layout.later[0].days[0].items.map((entry) => entry.id)).toEqual(['aug-12']);
    expect(layout.later[1].days).toEqual([]);
    expect(layout.later[2].days).toEqual([]);
  });

  it('AC9: Dec 1 task on Aug 26 is dropped past the 3-month window', () => {
    const item = task('dec-1', localNoonIso(2026, 12, 1));
    const layout = buildUpcomingLayout([item], new Date(2026, 7, 26));

    expect(layout.week.every((day) => day.items.length === 0)).toBe(true);
    expect(layout.later.every((month) => month.days.length === 0)).toBe(true);
  });

  it('AC10: today Nov 26 later is 12/4-12/31 then next-year Jan and Feb', () => {
    const layout = buildUpcomingLayout([], new Date(2026, 10, 26));

    expect(layout.week.map((day) => day.dateKey)).toEqual([
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
    ]);
    expect(layout.later).toHaveLength(3);
    expect(layout.later[0]).toMatchObject({
      year: 2026,
      month: 12,
      headingKind: 'range',
      rangeStartDay: 4,
      rangeEndDay: 31,
      showYear: false,
    });
    expect(layout.later[1]).toMatchObject({
      year: 2027,
      month: 1,
      headingKind: 'name',
      rangeStartDay: null,
      rangeEndDay: null,
      showYear: true,
    });
    expect(layout.later[2]).toMatchObject({
      year: 2027,
      month: 2,
      headingKind: 'name',
      rangeStartDay: null,
      rangeEndDay: null,
      showYear: true,
    });
  });

  it('places an in-window item on the matching day, not later', () => {
    const item = task('in-week', localNoonIso(2026, 8, 28));
    const layout = buildUpcomingLayout([item], new Date(2026, 7, 26));

    expect(layout.week[1].items.map((entry) => entry.id)).toEqual(['in-week']);
    expect(layout.week.filter((day) => day.items.length > 0)).toHaveLength(1);
    expect(layout.later.every((month) => month.days.length === 0)).toBe(true);
  });

  it('discards items without scheduledDate', () => {
    const layout = buildUpcomingLayout(
      [task('no-date', null), task('in-week', localNoonIso(2026, 8, 27))],
      new Date(2026, 7, 26),
    );

    expect(layout.week[0].items.map((entry) => entry.id)).toEqual(['in-week']);
    expect(layout.later.every((month) => month.days.length === 0)).toBe(true);
  });

  it('preserves within-day input order', () => {
    const first = task('first', localNoonIso(2026, 8, 27));
    const second = task('second', localNoonIso(2026, 8, 27));
    const layout = buildUpcomingLayout([first, second], new Date(2026, 7, 26));

    expect(layout.week[0].items.map((entry) => entry.id)).toEqual(['first', 'second']);
  });
});
