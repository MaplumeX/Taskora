import { i18n } from '@/i18n/config';

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

export function startOfTomorrow(): Date {
  const tomorrow = startOfToday();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

export function isTomorrow(date: Date): boolean {
  return isSameDay(date, startOfTomorrow());
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

/** Human-readable date label like "Today", "Tomorrow", "Mon", "Mar 5" */
export function formatDateLabel(date: Date): string {
  if (isToday(date)) return i18n.t('common:today');
  if (isTomorrow(date)) return i18n.t('common:tomorrow');
  // Within the next 7 days → weekday name
  const today = startOfToday();
  const diff = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - today.getTime()) /
      86_400_000,
  );
  const locale = i18n.language;
  if (diff > 0 && diff <= 6) {
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
}

/**
 * Short absolute date label like "Sep 2" / "9月2日"（locale 感知）。
 * 用于行内日期 chip——参考 Things 3:行上日期用短绝对格式，
 * 相对格式（Today/Tomorrow/星期几）只留给分组标题。
 */
export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * 截止日期倒计时文案——参考 Things 3 的 deadline 行尾展示:
 * 未来显示 "x days left",到期日 "today",逾期 "x days past due"。
 * 与 scheduledDate 的短绝对日期区分:文案格式本身即语义(计划 vs 必须完成)。
 */
export function formatDeadlineCountdown(date: Date): string {
  if (isToday(date)) return i18n.t('common:today');
  const days = Math.abs(dayDiff(startOfToday(), date));
  if (isOverdue(date)) return i18n.t('common:daysPastDue', { count: days });
  return i18n.t('common:daysLeft', { count: days });
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
