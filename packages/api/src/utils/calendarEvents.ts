import {
  addCalendarDays,
  instantDateKey,
  instantWallTime,
  type CalendarEventDto,
} from '@taskora/shared';

/**
 * 日程在某一天的样子（ADR 0023）：定时日程按账号时区归到它覆盖的每一天，
 * 跨天的只在首日显示开始、末日显示结束；中间整天被覆盖的按全天显示。
 */
export interface DayCalendarEvent {
  event: CalendarEventDto;
  /** 显示在哪一天（账号时区的日期键）。 */
  dateKey: string;
  /** 当天全天（全天日程，或跨天定时日程的中间日）。 */
  allDay: boolean;
  /** 当天的开始时刻（HH:mm）；从前一天延续而来为 null。 */
  startTime: string | null;
  /** 当天的结束时刻（HH:mm）；延续到之后为 null。 */
  endTime: string | null;
  /** 日程结束的 UTC 毫秒（全天日程为结束日的账号时区零点）。 */
  endsAt: number;
}

/** 日程按天分组（[from, to] 内的日期键 → 当天日程，全天在前、其余按开始时间）。 */
export function groupCalendarEventsByDay(
  events: readonly CalendarEventDto[],
  from: string,
  to: string,
  timeZone: string,
): Map<string, DayCalendarEvent[]> {
  const byDay = new Map<string, Array<{ entry: DayCalendarEvent; order: number }>>();
  const push = (day: string, entry: DayCalendarEvent, order: number) => {
    if (day < from || day > to) return;
    const list = byDay.get(day);
    if (list) list.push({ entry, order });
    else byDay.set(day, [{ entry, order }]);
  };

  for (const event of events) {
    if (event.allDay) {
      const endsAt = Date.parse(`${event.end}T00:00:00Z`);
      const first = event.start < from ? from : event.start;
      for (let day = first; day < event.end && day <= to; day = addCalendarDays(day, 1)) {
        push(day, { event, dateKey: day, allDay: true, startTime: null, endTime: null, endsAt }, 0);
      }
      continue;
    }
    const start = Date.parse(event.start);
    const end = Math.max(start, Date.parse(event.end));
    const startDay = instantDateKey(new Date(start), timeZone);
    // 恰好在零点结束的不算进下一天
    const endDay = end > start ? instantDateKey(new Date(end - 1), timeZone) : startDay;
    const first = startDay < from ? from : startDay;
    for (let day = first; day <= endDay && day <= to; day = addCalendarDays(day, 1)) {
      const startsToday = day === startDay;
      const endsToday = day === endDay;
      push(
        day,
        {
          event,
          dateKey: day,
          allDay: !startsToday && !endsToday,
          startTime: startsToday ? instantWallTime(start, timeZone).time : null,
          endTime: endsToday ? instantWallTime(end, timeZone).time : null,
          endsAt: end,
        },
        // 从前一天延续来的排在当天开始的之前
        startsToday ? start : Number.MIN_SAFE_INTEGER,
      );
    }
  }

  const out = new Map<string, DayCalendarEvent[]>();
  for (const [day, list] of byDay) {
    list.sort(
      (a, b) =>
        Number(b.entry.allDay) - Number(a.entry.allDay) ||
        (a.entry.allDay ? 0 : a.order - b.order) ||
        a.entry.event.title.localeCompare(b.entry.event.title),
    );
    out.set(
      day,
      list.map(({ entry }) => entry),
    );
  }
  return out;
}
