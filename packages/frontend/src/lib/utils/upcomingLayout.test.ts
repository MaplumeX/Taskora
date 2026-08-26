import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type { FeedItem } from '@taskora/shared';
import { describe, expect, it } from 'vitest';

import { buildUpcomingLayout } from './upcomingLayout';

const TODAY = new Date(2026, 7, 26);

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
  it('always returns 7 week days from tomorrow with empty later', () => {
    const layout = buildUpcomingLayout([], TODAY);

    expect(layout.week).toHaveLength(7);
    expect(layout.week.map((day) => day.dateKey)).toEqual([
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
    expect(layout.week.map((day) => day.dayOfMonth)).toEqual([
      27, 28, 29, 30, 31, 1, 2,
    ]);
    expect(layout.week[0].isTomorrow).toBe(true);
    expect(layout.week.slice(1).every((day) => day.isTomorrow === false)).toBe(true);
    expect(layout.week.every((day) => day.items.length === 0)).toBe(true);
    expect(layout.later).toEqual([]);
  });

  it('places an in-window item on the matching day, not later', () => {
    const item = task('in-week', localNoonIso(2026, 8, 28));
    const layout = buildUpcomingLayout([item], TODAY);

    expect(layout.week[1].items.map((entry) => entry.id)).toEqual(['in-week']);
    expect(layout.later).toEqual([]);
    expect(layout.week.filter((day) => day.items.length > 0)).toHaveLength(1);
  });

  it('puts a same-month later day after the week without a month heading', () => {
    const item = task('sep-12', localNoonIso(2026, 9, 12));
    const layout = buildUpcomingLayout([item], TODAY);

    expect(layout.week.every((day) => day.items.length === 0)).toBe(true);
    expect(layout.later).toHaveLength(1);
    expect(layout.later[0]).toMatchObject({
      year: 2026,
      month: 9,
      showHeading: false,
      showYear: false,
    });
    expect(layout.later[0].days.map((day) => day.dateKey)).toEqual(['2026-09-12']);
    expect(layout.later[0].days[0].items.map((entry) => entry.id)).toEqual(['sep-12']);
    expect(layout.later[0].days[0].isTomorrow).toBe(false);
  });

  it('shows a later month heading without year in the current year', () => {
    const item = task('oct-3', localNoonIso(2026, 10, 3));
    const layout = buildUpcomingLayout([item], TODAY);

    expect(layout.later).toHaveLength(1);
    expect(layout.later[0]).toMatchObject({
      year: 2026,
      month: 10,
      showHeading: true,
      showYear: false,
    });
    expect(layout.later[0].days.map((day) => day.dateKey)).toEqual(['2026-10-03']);
  });

  it('includes the year on a later month in a different year', () => {
    const item = task('jan-5', localNoonIso(2027, 1, 5));
    const layout = buildUpcomingLayout([item], TODAY);

    expect(layout.later).toHaveLength(1);
    expect(layout.later[0]).toMatchObject({
      year: 2027,
      month: 1,
      showHeading: true,
      showYear: true,
    });
    expect(layout.later[0].days.map((day) => day.dateKey)).toEqual(['2027-01-05']);
  });

  it('discards items without scheduledDate', () => {
    const layout = buildUpcomingLayout(
      [task('no-date', null), task('in-week', localNoonIso(2026, 8, 27))],
      TODAY,
    );

    expect(layout.week[0].items.map((entry) => entry.id)).toEqual(['in-week']);
    expect(layout.later).toEqual([]);
  });

  it('preserves within-day input order', () => {
    const first = task('first', localNoonIso(2026, 8, 27));
    const second = task('second', localNoonIso(2026, 8, 27));
    const layout = buildUpcomingLayout([first, second], TODAY);

    expect(layout.week[0].items.map((entry) => entry.id)).toEqual(['first', 'second']);
  });
});
