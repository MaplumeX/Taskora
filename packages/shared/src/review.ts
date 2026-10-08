import { Temporal } from '@js-temporal/polyfill';

/**
 * Review Interval（回顾间隔，见 CONTEXT.md）：Project / Area 上「N × 单位」
 * 的字段，是每次标记已回顾时加到下次回顾日上的量。新建时按对象类型写入账号
 * 的默认回顾间隔。同步 wire 上是 JSON 对象。
 */
export type ReviewUnit = 'day' | 'week' | 'month' | 'year';

export interface ReviewInterval {
  unit: ReviewUnit;
  /** 不小于 1 的整数。 */
  count: number;
}

export const REVIEW_UNITS: readonly ReviewUnit[] = ['day', 'week', 'month', 'year'];

/**
 * Default Review Interval（默认回顾间隔）：账号偏好里按对象类型分两档，只决定
 * 新建 Project / Area 时写入的回顾间隔；修改它不影响已有对象。
 */
export interface ReviewIntervalDefaults {
  project: ReviewInterval;
  area: ReviewInterval;
}

export type ReviewDefaultKind = keyof ReviewIntervalDefaults;

export const REVIEW_DEFAULT_KINDS: readonly ReviewDefaultKind[] = ['project', 'area'];

/** 默认回顾间隔的初始值：项目每周，Area 每月。 */
export const DEFAULT_REVIEW_INTERVALS: ReviewIntervalDefaults = {
  project: { unit: 'week', count: 1 },
  area: { unit: 'month', count: 1 },
};

/** 结构合法的回顾间隔（单位在白名单内、count 为不小于 1 的整数）→ 规范形；否则 null。 */
export function normalizeReviewInterval(value: unknown): ReviewInterval | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { unit, count } = value as Record<string, unknown>;
  if (!REVIEW_UNITS.includes(unit as ReviewUnit)) return null;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) return null;
  return { unit: unit as ReviewUnit, count };
}

/** 默认回顾间隔逐档规范化：缺失或不合法的档回退 fallback 的同档。 */
export function normalizeReviewIntervalDefaults(
  value: unknown,
  fallback: ReviewIntervalDefaults = DEFAULT_REVIEW_INTERVALS,
): ReviewIntervalDefaults {
  const raw =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    project: normalizeReviewInterval(raw.project) ?? fallback.project,
    area: normalizeReviewInterval(raw.area) ?? fallback.area,
  };
}

/** 账号偏好里的默认回顾间隔；缺失或不合法的档取初始值。 */
export function accountReviewIntervalDefaults(preferences: unknown): ReviewIntervalDefaults {
  const raw = (preferences as { defaultReviewIntervals?: unknown } | null)
    ?.defaultReviewIntervals;
  return normalizeReviewIntervalDefaults(raw);
}

/**
 * 日期键加 times 个回顾间隔（默认 1 个）。加月 / 年遇到月末溢出取目标月最后
 * 一天（1-31 + 1 月 → 2-28），与 Repeat Rule 的月份推算一致。
 */
export function addReviewInterval(day: string, interval: ReviewInterval, times = 1): string {
  const date = Temporal.PlainDate.from(day);
  const count = interval.count * times;
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

/**
 * 标记已回顾的下次回顾日：从锚点（原下次回顾日）加间隔，仍不晚于今天就继续
 * 加，直到晚于今天。每一步都从锚点算第 k 个间隔，月末锚点不漂移
 * （1-31 每月 → 2-28、3-31、4-30）。
 */
export function advanceReviewDate(anchor: string, interval: ReviewInterval, today: string): string {
  let times = 1;
  if (interval.unit === 'day' || interval.unit === 'week') {
    // 定长单位直接算出越过今天所需的次数
    const step = interval.count * (interval.unit === 'week' ? 7 : 1);
    const gap = Temporal.PlainDate.from(anchor).until(Temporal.PlainDate.from(today)).days;
    times = Math.max(1, Math.floor(gap / step) + 1);
  }
  let next = addReviewInterval(anchor, interval, times);
  while (next <= today) next = addReviewInterval(anchor, interval, ++times);
  return next;
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
