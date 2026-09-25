import type { FeedItem } from '@taskora/shared';

import { i18n } from '@/i18n/config';
import { dayDiff } from './date';

export type LogbookGroup = {
  key: string;
  label: string;
  items: FeedItem[];
};

function localDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** ISO 周（周一起始）的周序号：年内第几周 */
function weekOfYear(date: Date): number {
  const d = localDay(date);
  const day = (d.getDay() + 6) % 7; // 周一=0 … 周日=6
  d.setDate(d.getDate() - day + 3); // 本周周四（ISO 周年归属）
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/** ISO 周的周一（作为周分组代表日） */
function startOfWeek(date: Date): Date {
  const d = localDay(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

/** 日粒度上限：昨天之后到本周一之间的日子逐日展示（与今天/昨天连续） */
function dailyUpperBound(today: Date): Date {
  const monday = startOfWeek(today);
  return addDays(monday, -1); // 上周日
}

function groupKeyOf(date: Date, today: Date): string {
  const diff = dayDiff(date, today);
  if (diff <= 2) return `day:${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  // 与今天同属一个 ISO 周的日期逐日展示（覆盖今天=周一时紧邻的上周日等）
  if (weekOfYear(date) === weekOfYear(today) && date.getFullYear() === today.getFullYear()) {
    return `day:${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }
  // 之后的完整周按周；跨月周按「周日（区间终点）所在月」归属
  const weekEnd = addDays(startOfWeek(date), 6);
  if (weekEnd.getMonth() === today.getMonth() && weekEnd.getFullYear() === today.getFullYear()) {
    return `week:${date.getFullYear()}-${weekOfYear(date)}`;
  }
  if (date.getFullYear() === today.getFullYear()) return `month:${date.getMonth()}`;
  return `year:${date.getFullYear()}`;
}

function groupLabelOf(key: string, rep: Date, today: Date): string {
  const locale = i18n.language;
  const diff = dayDiff(rep, today);

  if (key.startsWith('day:')) {
    if (diff === 0) return i18n.t('common:today');
    if (diff === 1) return i18n.t('task:yesterday');
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(rep);
  }
  if (key.startsWith('week:')) {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return i18n.t('task:logbookWeekRange', {
      start: new Intl.DateTimeFormat(locale, opts).format(rep),
      end: new Intl.DateTimeFormat(locale, opts).format(addDays(rep, 6)),
    });
  }
  if (key.startsWith('month:')) {
    return new Intl.DateTimeFormat(locale, { month: 'long' }).format(rep);
  }
  return new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(rep);
}

/**
 * Logbook 渐进粒度分组：近期逐日、远期收拢
 * （对齐 Things Upcoming「近处精细、远处粗粒度」；粒度规则集中在这一处）。
 *
 * - 今天 / 昨天     → 相对词
 * - 3 天前～本周一   → 逐日（星期全称），与今天/昨天保持连续
 * - 本月更早的完整周 → 按周（「9月7日 – 9月13日」，ISO 周一起始）
 * - 当年更早        → 按月
 * - 跨年           → 按年
 *
 * 输入按 settledAt 倒序；空 completedAt 的条目跳过（与既有 Logbook 行为一致）。
 */
export function groupLogbookItems(items: FeedItem[], now: Date): LogbookGroup[] {
  const today = localDay(now);
  const groups: LogbookGroup[] = [];
  const index = new Map<string, number>();

  for (const item of items) {
    if (!item.completedAt) continue;
    const date = localDay(new Date(item.completedAt));
    const key = groupKeyOf(date, today);
    let gi = index.get(key);
    if (gi === undefined) {
      gi = groups.length;
      index.set(key, gi);
      groups.push({ key, label: '', items: [] });
    }
    groups[gi].items.push(item);
  }

  // 标签需要分组的代表日；周分组用该组任一日期的周一
  for (const group of groups) {
    const first = localDay(new Date(group.items[0].completedAt!));
    const rep = group.key.startsWith('week:') ? startOfWeek(first) : first;
    group.label = groupLabelOf(group.key, rep, today);
  }

  return groups;
}
