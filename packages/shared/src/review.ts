import { Temporal } from '@js-temporal/polyfill';

/**
 * Review Interval（回顾间隔，见 CONTEXT.md）：Project / Area 上「N × 单位」
 * 的字段，决定标记已回顾后多久再回顾。同步 wire 上是 JSON 对象。
 */
export type ReviewUnit = 'day' | 'week' | 'month' | 'year';

export interface ReviewInterval {
  unit: ReviewUnit;
  /** 不小于 1 的整数。 */
  count: number;
}

export const REVIEW_UNITS: readonly ReviewUnit[] = ['day', 'week', 'month', 'year'];

/** 账号默认回顾间隔的初始值：每周。 */
export const DEFAULT_REVIEW_INTERVAL: ReviewInterval = { unit: 'week', count: 1 };

/** 结构合法的回顾间隔（单位在白名单内、count 为不小于 1 的整数）→ 规范形；否则 null。 */
export function normalizeReviewInterval(value: unknown): ReviewInterval | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { unit, count } = value as Record<string, unknown>;
  if (!REVIEW_UNITS.includes(unit as ReviewUnit)) return null;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) return null;
  return { unit: unit as ReviewUnit, count };
}

/** 账号偏好里的默认回顾间隔；缺失或不合法时为初始的每周。 */
export function accountReviewInterval(preferences: unknown): ReviewInterval {
  const raw = (preferences as { defaultReviewInterval?: unknown } | null)?.defaultReviewInterval;
  return normalizeReviewInterval(raw) ?? DEFAULT_REVIEW_INTERVAL;
}

/**
 * 日期键加一个回顾间隔。加月 / 年遇到月末溢出取目标月最后一天
 * （1-31 + 1 月 → 2-28），与 Repeat Rule 的月份推算一致。
 */
export function addReviewInterval(day: string, interval: ReviewInterval): string {
  const date = Temporal.PlainDate.from(day);
  const { count } = interval;
  switch (interval.unit) {
    case 'day':
      return date.add({ days: count }).toString();
    case 'week':
      return date.add({ weeks: count }).toString();
    case 'month':
      return date.add({ months: count }, { overflow: 'constrain' }).toString();
    case 'year':
      return date.add({ years: count }, { overflow: 'constrain' }).toString();
  }
}

/** 回顾队列中的一个对象。 */
export interface ReviewQueueItem {
  kind: 'project' | 'area';
  id: string;
}

/** 回顾队列（Review Mode 的快照来源）。 */
export interface ReviewQueue {
  /** 待回顾对象：按下次回顾日升序，同日按侧边栏全局视觉顺序。待回顾数即其长度。 */
  items: ReviewQueueItem[];
  /** 下一次回顾日（今天之后最早的下次回顾日）与当天的数量；没有则 null。 */
  upcoming: { date: string; count: number } | null;
}
