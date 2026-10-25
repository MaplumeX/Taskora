import type { RepeatRule } from '@taskora/shared';
import type { TFunction } from 'i18next';

/**
 * Repeat Rule 的一行摘要（页头徽章用）：「每周」「每 2 周」「每周 · 周一、周三」
 * 「每月 · 1、15 号」「完成后 3 天」。
 * 星期顺序跟随周起始偏好，与 RepeatRuleField 的星期按钮一致。
 * 从完成日期算的规则不带星期 / 日子（编辑入口把两种模式隔离）。
 */
export function formatRepeatSummary(
  rule: RepeatRule,
  { t, language, weekStartsOn }: { t: TFunction; language: string; weekStartsOn: number },
): string {
  if (rule.anchor === 'completion') {
    return rule.interval === 1
      ? t(`task:repeatSummaryAfterOne-${rule.unit}`)
      : t('task:repeatSummaryAfterMany', {
          count: rule.interval,
          unit: t(`task:repeatUnit-${rule.unit}`),
        });
  }
  const base =
    rule.interval === 1
      ? t(`task:repeatSummaryOne-${rule.unit}`)
      : t('task:repeatSummaryMany', {
          count: rule.interval,
          unit: t(`task:repeatUnit-${rule.unit}`),
        });
  const separator = t('task:repeatWeekdaySeparator');
  const monthDays = rule.unit === 'month' ? (rule.monthDays ?? []) : [];
  if (monthDays.length > 0) return `${base} · ${formatMonthDays(monthDays, t)}`;
  const weekdays = rule.unit === 'week' ? (rule.weekdays ?? []) : [];
  if (weekdays.length === 0) return base;
  // 周一至周五恰好全选时按「工作日」显示（与预设同名）
  if (weekdays.join() === '1,2,3,4,5') return `${base} · ${t('task:repeatPresetWeekdays')}`;
  const fmt = new Intl.DateTimeFormat(language, { weekday: 'short' });
  const ordered = [...weekdays].sort(
    (a, b) => ((a - weekStartsOn + 7) % 7) - ((b - weekStartsOn + 7) % 7),
  );
  // 2023-01-01 是周日（day=0），用真实日期取本地化星期名
  const names = ordered.map((day) => fmt.format(new Date(2023, 0, 1 + day)));
  return `${base} · ${names.join(separator)}`;
}

/** 月模式日子列表：「1、15 号」「15 号、最后一天」。31 总会落在当月最后一天，按「最后一天」显示。 */
export function formatMonthDays(monthDays: number[], t: TFunction): string {
  const separator = t('task:repeatWeekdaySeparator');
  const days = monthDays.filter((day) => day !== 31);
  const parts =
    days.length > 0 ? [t('task:repeatSummaryMonthDays', { days: days.join(separator) })] : [];
  if (monthDays.includes(31)) parts.push(t('task:repeatSummaryMonthDayLast'));
  return parts.join(separator);
}
