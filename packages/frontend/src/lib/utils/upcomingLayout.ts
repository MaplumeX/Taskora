import type { FeedItem } from '@taskora/shared';

import { fromInputDateValue, toDateKey, toInputDateValue } from './date';

export type UpcomingDay = {
  dateKey: string;
  dayOfMonth: number;
  isTomorrow: boolean;
  items: FeedItem[];
};

export type UpcomingLaterMonth = {
  year: number;
  month: number; // 1-12
  showYear: boolean;
  showHeading: boolean;
  days: UpcomingDay[];
};

export type UpcomingLayout = {
  week: UpcomingDay[];
  later: UpcomingLaterMonth[];
};

function localDay(date: Date, offset = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

function yearMonth(date: Date): { year: number; month: number } {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function sameYearMonth(
  a: { year: number; month: number },
  b: { year: number; month: number },
): boolean {
  return a.year === b.year && a.month === b.month;
}

export function buildUpcomingLayout(items: FeedItem[], today: Date): UpcomingLayout {
  const weekStart = localDay(today, 1);
  const week: UpcomingDay[] = [];
  const weekIndex = new Map<string, number>();

  for (let i = 0; i < 7; i++) {
    const date = localDay(weekStart, i);
    const dateKey = toInputDateValue(date);
    weekIndex.set(dateKey, i);
    week.push({
      dateKey,
      dayOfMonth: date.getDate(),
      isTomorrow: i === 0,
      items: [],
    });
  }

  const weekEndKey = week[6].dateKey;
  const laterByDate = new Map<string, FeedItem[]>();

  for (const item of items) {
    if (!item.scheduledDate) continue;
    const dateKey = toDateKey(item.scheduledDate);
    const idx = weekIndex.get(dateKey);
    if (idx !== undefined) {
      week[idx].items.push(item);
      continue;
    }
    if (dateKey > weekEndKey) {
      const bucket = laterByDate.get(dateKey);
      if (bucket) bucket.push(item);
      else laterByDate.set(dateKey, [item]);
    }
  }

  const laterDateKeys = [...laterByDate.keys()].sort((a, b) => a.localeCompare(b));
  const todayYear = today.getFullYear();
  const weekEnd = yearMonth(fromInputDateValue(weekEndKey));
  const later: UpcomingLaterMonth[] = [];

  for (const dateKey of laterDateKeys) {
    const date = fromInputDateValue(dateKey);
    const ym = yearMonth(date);
    const day: UpcomingDay = {
      dateKey,
      dayOfMonth: date.getDate(),
      isTomorrow: false,
      items: laterByDate.get(dateKey) ?? [],
    };
    const current = later[later.length - 1];
    if (current && sameYearMonth(current, ym)) {
      current.days.push(day);
      continue;
    }
    const prev = current ?? weekEnd;
    later.push({
      year: ym.year,
      month: ym.month,
      showYear: ym.year !== todayYear,
      showHeading: !sameYearMonth(ym, prev),
      days: [day],
    });
  }

  return { week, later };
}
