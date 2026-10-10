import { describe, expect, it } from 'vitest';

import { expandCalendar, parseCalendar, resolveIanaZone } from '../src/calendar/ics';

function ics(...lines: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...lines, 'END:VCALENDAR'].join(
    '\r\n',
  );
}

function event(...lines: string[]): string[] {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
}

const SHANGHAI = { timeZone: 'Asia/Shanghai' };

function expand(text: string, from: string, to: string, timeZone = 'Asia/Shanghai') {
  return expandCalendar(parseCalendar(text), { from, to, timeZone });
}

const iso = (ms: number) => new Date(ms).toISOString();

describe('parseCalendar', () => {
  it('reads X-WR-CALNAME as the calendar name', () => {
    expect(parseCalendar(ics('X-WR-CALNAME:工作')).name).toBe('工作');
    expect(parseCalendar(ics()).name).toBeNull();
  });

  it('rejects text that is not iCalendar', () => {
    expect(() => parseCalendar('<html></html>')).toThrow();
    expect(() => parseCalendar('BEGIN:VCARD\r\nEND:VCARD')).toThrow();
  });
});

describe('expandCalendar', () => {
  it('returns UTC and all-day events overlapping the range', () => {
    const text = ics(
      ...event(
        'UID:a',
        'DTSTART:20261012T010000Z',
        'DTEND:20261012T020000Z',
        'SUMMARY:会议',
        'LOCATION:3F',
      ),
      ...event('UID:b', 'DTSTART;VALUE=DATE:20261012', 'DTEND;VALUE=DATE:20261013', 'SUMMARY:生日'),
      ...event('UID:c', 'DTSTART:20261020T010000Z', 'DTEND:20261020T020000Z', 'SUMMARY:之后'),
    );
    const out = expand(text, '2026-10-12', '2026-10-12');
    expect(out).toEqual([
      {
        uid: 'b',
        title: '生日',
        location: null,
        allDay: true,
        start: '2026-10-12',
        end: '2026-10-13',
      },
      {
        uid: 'a',
        title: '会议',
        location: '3F',
        allDay: false,
        start: Date.parse('2026-10-12T01:00:00Z'),
        end: Date.parse('2026-10-12T02:00:00Z'),
      },
    ]);
  });

  it('cuts the range at account-zone midnight', () => {
    // 2026-10-11T17:00Z = 10-12 01:00 in Shanghai, but still 10-11 in UTC
    const text = ics(
      ...event('UID:a', 'DTSTART:20261011T170000Z', 'DTEND:20261011T180000Z', 'SUMMARY:早'),
    );
    expect(expand(text, '2026-10-12', '2026-10-12')).toHaveLength(1);
    expect(expand(text, '2026-10-12', '2026-10-12', 'UTC')).toHaveLength(0);
  });

  it('keeps multi-day events that started before the range', () => {
    const text = ics(
      ...event('UID:a', 'DTSTART;VALUE=DATE:20261010', 'DTEND;VALUE=DATE:20261015', 'SUMMARY:出差'),
      ...event('UID:b', 'DTSTART:20261010T100000Z', 'DTEND:20261013T100000Z', 'SUMMARY:跨天'),
    );
    expect(expand(text, '2026-10-12', '2026-10-12').map((o) => o.uid)).toEqual(['a', 'b']);
  });

  it('treats an all-day event without DTEND as a single day', () => {
    const text = ics(...event('UID:a', 'DTSTART;VALUE=DATE:20261012', 'SUMMARY:x'));
    expect(expand(text, '2026-10-12', '2026-10-12')).toMatchObject([
      { allDay: true, start: '2026-10-12', end: '2026-10-13' },
    ]);
  });

  it('expands RRULE with EXDATE and RECURRENCE-ID overrides', () => {
    const text = ics(
      ...event(
        'UID:weekly',
        'DTSTART:20260105T010000Z',
        'DTEND:20260105T020000Z',
        'RRULE:FREQ=DAILY',
        'EXDATE:20261013T010000Z',
        'SUMMARY:站会',
      ),
      ...event(
        'UID:weekly',
        'RECURRENCE-ID:20261014T010000Z',
        'DTSTART:20261014T060000Z',
        'DTEND:20261014T070000Z',
        'SUMMARY:站会（改到下午）',
      ),
    );
    const out = expand(text, '2026-10-12', '2026-10-15');
    expect(out.map((o) => [o.title, iso(o.start as number)])).toEqual([
      ['站会', '2026-10-12T01:00:00.000Z'],
      ['站会（改到下午）', '2026-10-14T06:00:00.000Z'],
      ['站会', '2026-10-15T01:00:00.000Z'],
    ]);
  });

  it('includes an override moved into the range from outside it', () => {
    const text = ics(
      ...event(
        'UID:r',
        'DTSTART:20261001T010000Z',
        'DTEND:20261001T020000Z',
        'RRULE:FREQ=WEEKLY;COUNT=3',
        'SUMMARY:周会',
      ),
      ...event(
        'UID:r',
        'RECURRENCE-ID:20261015T010000Z',
        'DTSTART:20261012T010000Z',
        'DTEND:20261012T020000Z',
        'SUMMARY:周会（提前）',
      ),
    );
    expect(expand(text, '2026-10-12', '2026-10-12').map((o) => o.title)).toEqual(['周会（提前）']);
  });

  it('skips cancelled events and cancelled occurrences', () => {
    const text = ics(
      ...event(
        'UID:a',
        'DTSTART:20261012T010000Z',
        'DTEND:20261012T020000Z',
        'STATUS:CANCELLED',
        'SUMMARY:x',
      ),
      ...event(
        'UID:r',
        'DTSTART:20261012T030000Z',
        'DTEND:20261012T040000Z',
        'RRULE:FREQ=DAILY;COUNT=2',
        'SUMMARY:y',
      ),
      ...event(
        'UID:r',
        'RECURRENCE-ID:20261013T030000Z',
        'DTSTART:20261013T030000Z',
        'DTEND:20261013T040000Z',
        'STATUS:CANCELLED',
        'SUMMARY:y',
      ),
    );
    expect(expand(text, '2026-10-12', '2026-10-13').map((o) => o.uid)).toEqual(['r']);
  });

  it('uses VTIMEZONE definitions from the file', () => {
    const text = ics(
      'BEGIN:VTIMEZONE',
      'TZID:Custom Zone',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0300',
      'TZOFFSETTO:+0300',
      'END:STANDARD',
      'END:VTIMEZONE',
      ...event(
        'UID:a',
        'DTSTART;TZID=Custom Zone:20261012T090000',
        'DTEND;TZID=Custom Zone:20261012T100000',
        'SUMMARY:x',
      ),
    );
    expect(iso(expand(text, '2026-10-12', '2026-10-12')[0].start as number)).toBe(
      '2026-10-12T06:00:00.000Z',
    );
  });

  it('interprets an IANA TZID without VTIMEZONE in that zone, across DST', () => {
    const text = ics(
      ...event(
        'UID:a',
        'DTSTART;TZID=Europe/Berlin:20261020T090000',
        'DTEND;TZID=Europe/Berlin:20261020T100000',
        'RRULE:FREQ=WEEKLY;COUNT=2',
        'SUMMARY:x',
      ),
    );
    // 10-20 CEST (+2), 10-27 CET (+1)
    expect(
      expand(text, '2026-10-19', '2026-10-31', 'UTC').map((o) => iso(o.start as number)),
    ).toEqual(['2026-10-20T07:00:00.000Z', '2026-10-27T08:00:00.000Z']);
  });

  it('interprets floating times in the account zone', () => {
    const text = ics(
      ...event('UID:a', 'DTSTART:20261012T090000', 'DTEND:20261012T100000', 'SUMMARY:x'),
    );
    expect(
      iso(expand(text, '2026-10-12', '2026-10-12', SHANGHAI.timeZone)[0].start as number),
    ).toBe('2026-10-12T01:00:00.000Z');
  });

  it('uses DURATION when DTEND is missing', () => {
    const text = ics(...event('UID:a', 'DTSTART:20261012T010000Z', 'DURATION:PT90M', 'SUMMARY:x'));
    const [occurrence] = expand(text, '2026-10-12', '2026-10-12');
    expect(iso(occurrence.end as number)).toBe('2026-10-12T02:30:00.000Z');
  });
});

describe('resolveIanaZone', () => {
  it('accepts IANA names and strips vendor prefixes', () => {
    expect(resolveIanaZone('Europe/Berlin')).toBe('Europe/Berlin');
    expect(resolveIanaZone('/mozilla.org/20050126_1/Europe/Berlin')).toBe('Europe/Berlin');
    expect(resolveIanaZone('China Standard Time')).toBeNull();
    expect(resolveIanaZone(null)).toBeNull();
  });
});
