import { describe, expect, it } from 'vitest';

import type { CalendarEventDto } from '@taskora/shared';

import { groupCalendarEventsByDay } from './calendarEvents';

const base = { subscriptionId: 's', color: 'blue' as const, location: null };

function timed(id: string, start: string, end: string, title = id): CalendarEventDto {
  return { ...base, id, title, allDay: false, start, end };
}

function allDay(id: string, start: string, end: string, title = id): CalendarEventDto {
  return { ...base, id, title, allDay: true, start, end };
}

function summary(map: ReturnType<typeof groupCalendarEventsByDay>) {
  return Object.fromEntries(
    [...map].map(([day, list]) => [
      day,
      list.map(
        (e) => `${e.event.id}:${e.allDay ? 'all' : `${e.startTime ?? ''}-${e.endTime ?? ''}`}`,
      ),
    ]),
  );
}

describe('groupCalendarEventsByDay', () => {
  it('places timed events on their account-zone day', () => {
    // 17:00Z = 次日 01:00（上海）
    const events = [timed('a', '2026-10-11T17:00:00Z', '2026-10-11T18:00:00Z')];
    expect(
      summary(groupCalendarEventsByDay(events, '2026-10-11', '2026-10-12', 'Asia/Shanghai')),
    ).toEqual({
      '2026-10-12': ['a:01:00-02:00'],
    });
    expect(summary(groupCalendarEventsByDay(events, '2026-10-11', '2026-10-12', 'UTC'))).toEqual({
      '2026-10-11': ['a:17:00-18:00'],
    });
  });

  it('spreads multi-day events across days and clips to the range', () => {
    const events = [
      timed('trip', '2026-10-10T02:00:00Z', '2026-10-13T04:00:00Z'),
      allDay('fest', '2026-10-09', '2026-10-12'),
    ];
    expect(summary(groupCalendarEventsByDay(events, '2026-10-10', '2026-10-14', 'UTC'))).toEqual({
      '2026-10-10': ['fest:all', 'trip:02:00-'],
      '2026-10-11': ['fest:all', 'trip:all'],
      '2026-10-12': ['trip:all'],
      '2026-10-13': ['trip:-04:00'],
    });
  });

  it('does not spill an event ending at midnight into the next day', () => {
    const events = [timed('late', '2026-10-12T22:00:00Z', '2026-10-13T00:00:00Z')];
    expect(summary(groupCalendarEventsByDay(events, '2026-10-12', '2026-10-13', 'UTC'))).toEqual({
      '2026-10-12': ['late:22:00-00:00'],
    });
  });

  it('orders all-day first, then carried-over, then by start time', () => {
    const events = [
      timed('b', '2026-10-12T09:00:00Z', '2026-10-12T10:00:00Z'),
      timed('a', '2026-10-12T08:00:00Z', '2026-10-12T08:30:00Z'),
      timed('night', '2026-10-11T23:00:00Z', '2026-10-12T01:00:00Z'),
      allDay('z', '2026-10-12', '2026-10-13'),
    ];
    expect(summary(groupCalendarEventsByDay(events, '2026-10-12', '2026-10-12', 'UTC'))).toEqual({
      '2026-10-12': ['z:all', 'night:-01:00', 'a:08:00-08:30', 'b:09:00-10:00'],
    });
  });
});
