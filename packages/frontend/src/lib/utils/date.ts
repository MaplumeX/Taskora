export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function isTomorrow(date: Date): boolean {
  const tomorrow = startOfToday();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameDay(date, tomorrow);
}

export function isOverdue(date: Date): boolean {
  return date < startOfToday() && !isToday(date);
}

export function toInputDateValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromInputDateValue(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** Human-readable date label like "今天", "明天", "周一", "3月5日" */
export function formatDateLabel(date: Date): string {
  if (isToday(date)) return '今天';
  if (isTomorrow(date)) return '明天';
  // Within the next 7 days → weekday name
  const today = startOfToday();
  const diff = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      today.getTime()) /
      86_400_000,
  );
  if (diff > 0 && diff <= 6) return WEEKDAYS[date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** yyyy-mm-dd key for grouping (from ISO or Date) */
export function toDateKey(source: string | Date): string {
  const date = typeof source === 'string' ? new Date(source) : source;
  return toInputDateValue(date);
}

/**
 * Whole-day difference between two dates (b - a), based on calendar days
 * rather than millisecond delta to avoid timezone edge cases.
 * Returns 0 when both fall on the same calendar day.
 */
export function dayDiff(a: string | Date, b: string | Date): number {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  const startA = new Date(da.getFullYear(), da.getMonth(), da.getDate());
  const startB = new Date(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((startB.getTime() - startA.getTime()) / 86_400_000);
}