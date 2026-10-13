import type { RepeatRule } from '@taskora/shared';
import type { TFunction } from 'i18next';

/**
 * Repeat Rule 的一行摘要（页头徽章用）：「每周」「每 2 周」「每周 · 周一、周三」
 * 「每月 · 1、15 号」。
 * 星期顺序跟随周起始偏好，与 RepeatRuleField 的星期按钮一致。
 */
export function formatRepeatSummary(
  rule: RepeatRule,
  { t, language, weekStartsOn }: { t: TFunction; language: string; weekStartsOn: number },
): string {
  const base =
    rule.interval === 1
      ? t(`task:repeatSummaryOne-${rule.unit}`)
      : t('task:repeatSummaryMany', {
          count: rule.interval,
          unit: t(`task:repeatUnit-${rule.unit}`),
        });
  const separator = t('task:repeatWeekdaySeparator');
  const monthDays = rule.unit === 'month' ? (rule.monthDays ?? []) : [];
  if (monthDays.length > 0) {
    // 31 总会落在当月最后一天，按「最后一天」显示
    const days = monthDays.filter((day) => day !== 31);
    const parts =
      days.length > 0 ? [t('task:repeatSummaryMonthDays', { days: days.join(separator) })] : [];
    if (monthDays.includes(31)) parts.push(t('task:repeatSummaryMonthDayLast'));
    return `${base} · ${parts.join(separator)}`;
  }
  const weekdays = rule.unit === 'week' ? (rule.weekdays ?? []) : [];
  if (weekdays.length === 0) return base;
  const fmt = new Intl.DateTimeFormat(language, { weekday: 'short' });
  const ordered = [...weekdays].sort(
    (a, b) => ((a - weekStartsOn + 7) % 7) - ((b - weekStartsOn + 7) % 7),
  );
  // 2023-01-01 是周日（day=0），用真实日期取本地化星期名
  const names = ordered.map((day) => fmt.format(new Date(2023, 0, 1 + day)));
  return `${base} · ${names.join(separator)}`;
}
