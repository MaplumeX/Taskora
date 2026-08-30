import type { TaskResponseDto } from '@taskora/shared';

import { toDateKey } from '@/lib/utils/date';

/** Week start index (0=Sunday, 1=Monday) from the user preference store value. */
export type WeekStartsOn = 0 | 1;

/**
 * Build the 6×7 = 42 cells of a month grid anchored on `anchor`'s month.
 * Cells may include trailing/leading days of adjacent months.
 */
export function buildMonthCells(anchor: Date, weekStartsOn: WeekStartsOn = 1): Date[] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const shift = (firstOfMonth.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - shift);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

/**
 * Shift `anchor` by `direction` months, clamped to a safe in-month day.
 * Using the 1st of the resulting month avoids the native `setMonth`
 * overflow (e.g. Jan 31 + 1 month → Mar 3, skipping February).
 */
export function addMonths(anchor: Date, direction: number): Date {
  const targetMonth = anchor.getMonth() + direction;
  return new Date(anchor.getFullYear(), targetMonth, 1);
}

/** Shift `anchor` by whole days (timezone-safe via calendar-day math). */
export function addDays(anchor: Date, days: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + days);
}

/** Build the 7 days of the week containing `anchor`, starting on `weekStartsOn`. */
export function buildWeekDays(anchor: Date, weekStartsOn: WeekStartsOn = 1): Date[] {
  const shift = (anchor.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  start.setDate(start.getDate() - shift);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

/**
 * Group tasks by their local-date `dueDate` key (`yyyy-MM-dd`).
 * Tasks without a `dueDate` are skipped.
 */
export function groupByDueDate(
  tasks: TaskResponseDto[],
): Map<string, TaskResponseDto[]> {
  const map = new Map<string, TaskResponseDto[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const key = toDateKey(task.dueDate);
    const list = map.get(key);
    if (list) {
      list.push(task);
    } else {
      map.set(key, [task]);
    }
  }
  return map;
}

/** Short weekday labels (7 entries) starting at `weekStartsOn`, formatted by `locale`. */
export function buildWeekdayLabels(locale: string, weekStartsOn: WeekStartsOn = 1): string[] {
  // 2024-01-07 is a Sunday; use it to get one of each weekday deterministically.
  const sunday = new Date(2024, 0, 7);
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + weekStartsOn + i);
    labels.push(formatter.format(d));
  }
  return labels;
}
