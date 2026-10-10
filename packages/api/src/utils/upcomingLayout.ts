import type { FeedItem } from '@taskora/shared';
import type { RepeatPreview } from '@taskora/engine';

import { fromInputDateValue, toDateKey, toInputDateValue, instantCalendarDate } from './date';

export type UpcomingDay = {
  dateKey: string;
  numberLabel: string;
  isTomorrow: boolean;
  items: FeedItem[];
  /** 下次预告（只读，排在当天真实条目之后）。 */
  previews: RepeatPreview[];
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
  if (date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth()) {
    return String(date.getDate());
  }
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function monthEndDate(ym: { year: number; month: number }): Date {
  return new Date(ym.year, ym.month, 0);
}

/**
 * Upcoming 覆盖的整个日期区间（账号时区的日期键，含首尾）：今天起，到本周
 * 7 天之后第 3 个月分组的月末。Today 与 Upcoming 的日程共用这个查询区间。
 */
export function upcomingDateRange(todayKey: string): { from: string; to: string } {
  const laterStart = localDay(fromInputDateValue(todayKey), 8);
  const laterEnd = new Date(laterStart.getFullYear(), laterStart.getMonth() + 3, 0);
  return { from: todayKey, to: toInputDateValue(laterEnd) };
}

/** 月份分组覆盖的日期区间（与本周重叠的月份从本周之后那天起）。 */
export function laterMonthDateRange(month: UpcomingLaterMonth): { from: string; to: string } {
  const startDay = month.headingKind === 'range' ? (month.rangeStartDay ?? 1) : 1;
  return {
    from: toInputDateValue(new Date(month.year, month.month - 1, startDay)),
    to: toInputDateValue(monthEndDate(month)),
  };
}

export function buildUpcomingLayout(
  items: FeedItem[],
  today: Date,
  previews: readonly RepeatPreview[] = [],
): UpcomingLayout {
  today = instantCalendarDate(today);
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
      previews: [],
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
  const laterByDate = new Map<string, { items: FeedItem[]; previews: RepeatPreview[] }>();
  const laterDay = (dateKey: string) => {
    let entry = laterByDate.get(dateKey);
    if (!entry) {
      entry = { items: [], previews: [] };
      laterByDate.set(dateKey, entry);
    }
    return entry;
  };

  for (const item of items) {
    if (!item.scheduledDate) continue;
    const dateKey = toDateKey(item.scheduledDate);
    const idx = weekIndex.get(dateKey);
    if (idx !== undefined) {
      week[idx].items.push(item);
      continue;
    }
    if (dateKey > weekEndKey && dateKey <= laterEndKey) laterDay(dateKey).items.push(item);
  }

  for (const preview of previews) {
    const idx = weekIndex.get(preview.dateKey);
    if (idx !== undefined) {
      week[idx].previews.push(preview);
      continue;
    }
    if (preview.dateKey > weekEndKey && preview.dateKey <= laterEndKey) {
      laterDay(preview.dateKey).previews.push(preview);
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
      ...laterByDate.get(dateKey)!,
    });
  }

  return { week, later };
}
