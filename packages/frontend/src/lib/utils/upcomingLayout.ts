import type { FeedItem } from '@taskora/shared';

import { fromInputDateValue, toDateKey, toInputDateValue } from './date';

export type UpcomingDay = {
  dateKey: string;
  numberLabel: string;
  isTomorrow: boolean;
  items: FeedItem[];
};

export type UpcomingLaterMonth = {
  year: number;
  month: number; // 1-12
  showYear: boolean;
  headingKind: 'range' | 'name';
  rangeStartDay: number | null;
  rangeEndDay: number | null;
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

function numberLabel(date: Date, today: Date): string {
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth()
  ) {
    return String(date.getDate());
  }
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function monthEndDate(ym: { year: number; month: number }): Date {
  return new Date(ym.year, ym.month, 0);
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
      numberLabel: numberLabel(date, today),
      isTomorrow: i === 0,
      items: [],
    });
  }

  const weekEndKey = week[6].dateKey;
  let cursor = localDay(fromInputDateValue(weekEndKey), 1);
  const later: UpcomingLaterMonth[] = [];

  for (let i = 0; i < 3; i++) {
    const ym = yearMonth(cursor);
    const monthEnd = monthEndDate(ym);
    const overlapsWeek = week.some((day) =>
      sameYearMonth(yearMonth(fromInputDateValue(day.dateKey)), ym),
    );
    later.push({
      year: ym.year,
      month: ym.month,
      showYear: ym.year !== today.getFullYear(),
      headingKind: overlapsWeek ? 'range' : 'name',
      rangeStartDay: overlapsWeek ? cursor.getDate() : null,
      rangeEndDay: overlapsWeek ? monthEnd.getDate() : null,
      days: [],
    });
    cursor = localDay(monthEnd, 1);
  }

  const laterEndKey = toInputDateValue(monthEndDate(later[2]));
  const laterByDate = new Map<string, FeedItem[]>();

  for (const item of items) {
    if (!item.scheduledDate) continue;
    const dateKey = toDateKey(item.scheduledDate);
    const idx = weekIndex.get(dateKey);
    if (idx !== undefined) {
      week[idx].items.push(item);
      continue;
    }
    if (dateKey > weekEndKey && dateKey <= laterEndKey) {
      const bucket = laterByDate.get(dateKey);
      if (bucket) bucket.push(item);
      else laterByDate.set(dateKey, [item]);
    }
  }

  const laterDateKeys = [...laterByDate.keys()].sort((a, b) => a.localeCompare(b));
  for (const dateKey of laterDateKeys) {
    const date = fromInputDateValue(dateKey);
    const ym = yearMonth(date);
    const month = later.find((block) => sameYearMonth(block, ym));
    if (!month) continue;
    month.days.push({
      dateKey,
      numberLabel: numberLabel(date, today),
      isTomorrow: false,
      items: laterByDate.get(dateKey) ?? [],
    });
  }

  return { week, later };
}
