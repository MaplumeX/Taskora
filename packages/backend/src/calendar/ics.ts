import ICAL from 'ical.js';

import { addCalendarDays, calendarTimeInstant, isValidTimeZone } from '@taskora/shared';

/**
 * ICS 解析与展开（ADR 0023）：纯函数，不做 I/O。解析结果按订阅缓存，
 * 每次查询再按区间展开重复规则。
 */

/** 单个日程最多迭代的重复次数（从 DTSTART 起算，含区间之前的）。 */
const MAX_ITERATIONS_PER_EVENT = 20_000;
/** 一次展开最多返回的出现数。 */
const MAX_OCCURRENCES = 5_000;

export interface ParsedCalendar {
  name: string | null;
  component: ICAL.Component;
}

/** 区间内的一次出现。全天：日期键（end 不含）；定时：UTC 毫秒。 */
export type Occurrence =
  | {
      uid: string;
      title: string;
      location: string | null;
      allDay: true;
      start: string;
      end: string;
    }
  | {
      uid: string;
      title: string;
      location: string | null;
      allDay: false;
      start: number;
      end: number;
    };

export interface ExpandRange {
  /** 账号时区的首日（含）。 */
  from: string;
  /** 账号时区的末日（含）。 */
  to: string;
  /** 账号时区：浮动时间与区间边界按它解释。 */
  timeZone: string;
}

/** 解析 ICS 文本；不是日历时抛错。 */
export function parseCalendar(text: string): ParsedCalendar {
  const component = new ICAL.Component(ICAL.parse(text));
  if (component.name !== 'vcalendar') throw new Error('not a VCALENDAR');
  const name = component.getFirstPropertyValue('x-wr-calname');
  return {
    name: typeof name === 'string' && name.trim() ? name.trim() : null,
    component,
  };
}

/** 把日历在区间内的全部出现展开出来（已按开始排序）。 */
export function expandCalendar(calendar: ParsedCalendar, range: ExpandRange): Occurrence[] {
  const rangeStartMs = calendarTimeInstant(range.from, '00:00', range.timeZone);
  const toExclusive = addCalendarDays(range.to, 1);
  const rangeEndMs = calendarTimeInstant(toExclusive, '00:00', range.timeZone);

  const masters = new Map<string, ICAL.Event>();
  const orphans: ICAL.Event[] = [];
  const exceptions: ICAL.Event[] = [];
  for (const vevent of calendar.component.getAllSubcomponents('vevent')) {
    let event: ICAL.Event;
    try {
      event = new ICAL.Event(vevent);
    } catch {
      continue;
    }
    if (!event.startDate) continue;
    if (event.isRecurrenceException()) exceptions.push(event);
    else if (event.uid && !masters.has(event.uid)) masters.set(event.uid, event);
    else orphans.push(event);
  }
  for (const exception of exceptions) {
    const master = masters.get(exception.uid);
    if (master) master.relateException(exception);
    // 没有主日程的单次改动按普通日程显示
    else orphans.push(exception);
  }

  const out: Occurrence[] = [];
  const emit = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time, zone: string | null) => {
    if (out.length >= MAX_OCCURRENCES) return;
    if (isCancelled(event)) return;
    const base = {
      uid: event.uid || '',
      title: (event.summary ?? '').trim(),
      location: event.location?.trim() || null,
    };
    if (start.isDate) {
      const startKey = dateKey(start);
      // DTEND 缺省或不晚于开始：单日
      let endKey = end.isDate ? dateKey(end) : addCalendarDays(startKey, 1);
      if (endKey <= startKey) endKey = addCalendarDays(startKey, 1);
      if (startKey < toExclusive && endKey > range.from) {
        out.push({ ...base, allDay: true, start: startKey, end: endKey });
      }
      return;
    }
    const startMs = instantOf(start, zone, range.timeZone);
    let endMs = instantOf(end, zone, range.timeZone);
    if (endMs < startMs) endMs = startMs;
    const overlaps =
      endMs > startMs
        ? startMs < rangeEndMs && endMs > rangeStartMs
        : startMs >= rangeStartMs && startMs < rangeEndMs;
    if (overlaps) out.push({ ...base, allDay: false, start: startMs, end: endMs });
  };

  for (const event of [...masters.values(), ...orphans]) {
    const zone = startZoneId(event);
    if (!event.isRecurring()) {
      emit(event, event.startDate, event.endDate, zone);
      continue;
    }
    const iterator = event.iterator();
    for (let i = 0; i < MAX_ITERATIONS_PER_EVENT; i++) {
      const next = iterator.next();
      if (!next) break;
      const details = event.getOccurrenceDetails(next);
      // 迭代按原始开始时间单调递增；单次改动可能被挪到区间内，按改动后的时间判断
      if (
        isAfterRange(next, zone, range, toExclusive, rangeEndMs) &&
        isAfterRange(details.startDate, zone, range, toExclusive, rangeEndMs)
      ) {
        break;
      }
      emit(details.item, details.startDate, details.endDate, zone);
    }
  }

  return out.sort((a, b) => sortKey(a) - sortKey(b));
}

function isAfterRange(
  time: ICAL.Time,
  zone: string | null,
  range: ExpandRange,
  toExclusive: string,
  rangeEndMs: number,
): boolean {
  return time.isDate
    ? dateKey(time) >= toExclusive
    : instantOf(time, zone, range.timeZone) >= rangeEndMs;
}

function sortKey(occurrence: Occurrence): number {
  return occurrence.allDay
    ? calendarTimeInstant(occurrence.start, '00:00', 'UTC')
    : occurrence.start;
}

function isCancelled(event: ICAL.Event): boolean {
  const status = event.component.getFirstPropertyValue('status');
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED';
}

function dateKey(time: ICAL.Time): string {
  return `${String(time.year).padStart(4, '0')}-${pad(time.month)}-${pad(time.day)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** DTSTART 的 TZID 参数（文件里没有对应 VTIMEZONE 时用它按 IANA 解释墙钟）。 */
function startZoneId(event: ICAL.Event): string | null {
  const tzid = event.component.getFirstProperty('dtstart')?.getParameter('tzid');
  return typeof tzid === 'string' ? tzid : null;
}

/**
 * ICAL.Time → UTC 毫秒。UTC 与文件内 VTIMEZONE 定义的时间由 ical.js 换算；
 * 浮动时间（含 TZID 找不到定义的）按墙钟解释：TZID 是 IANA 名时用它，
 * 否则用账号时区。
 */
function instantOf(time: ICAL.Time, tzid: string | null, accountZone: string): number {
  const zone = time.zone;
  if (zone && zone.tzid !== 'floating') return time.toUnixTime() * 1000;
  // 找不到定义的 TZID 由 ical.js 留在实例上（类型声明里没有）
  const unresolved = (time as unknown as { timezone?: string }).timezone;
  const iana = resolveIanaZone(unresolved ?? tzid) ?? accountZone;
  return calendarTimeInstant(
    dateKey(time),
    `${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`,
    iana,
  );
}

/** TZID → IANA 名；兼容 `/mozilla.org/20050126_1/Europe/Berlin` 这类前缀写法。 */
export function resolveIanaZone(tzid: string | null | undefined): string | null {
  if (!tzid) return null;
  const trimmed = tzid.trim().replace(/^"|"$/g, '');
  const parts = trimmed.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(i).join('/');
    if ((i === 0 || candidate.includes('/')) && isValidTimeZone(candidate)) return candidate;
  }
  return null;
}
