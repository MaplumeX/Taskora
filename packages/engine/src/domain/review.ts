/**
 * Review（回顾，见 CONTEXT.md）：Project / Area 的回顾排期规则。设备的
 * Engine 后端与 hub 的 REST 服务共用。
 *
 * - 新建时按对象类型（项目 / Area）写入账号的默认回顾间隔；之后间隔属于对象
 *   自己，修改默认值不影响已有对象。间隔为空只出现在存量或不合法数据上，按
 *   默认值计算，标记已回顾时补写。
 * - 下次回顾日是锚点：标记已回顾在它上面加间隔（加到晚于今天）；改间隔不动
 *   它。为空（存量数据）视为今天。
 * - 上次回顾日只由标记已回顾写入，只用于显示。
 */

import {
  advanceReviewDate,
  addReviewInterval,
  normalizeReviewInterval,
  ProjectStatus,
  type ReviewDefaultKind,
  type ReviewInterval,
  type ReviewIntervalDefaults,
  type ReviewQueue,
  type ReviewQueueItem,
} from '@taskora/shared';

import { dateKeyOf, type CalendarZones } from './calendar';
import { flatParentOrder, sortByEffectivePosition, type Positioned } from './order';

/** 输入的下次回顾日是日期键，与时区无关；只有旧的时刻编码才需要账号时区。 */
const UTC_ZONES: CalendarZones = { timeZone: 'UTC', legacyDateTimeZone: 'UTC' };

/** 回顾排期的上下文：账号时区的今天与账号的默认回顾间隔。 */
export interface ReviewContext {
  today: string;
  defaults: ReviewIntervalDefaults;
}

export interface ReviewFields {
  reviewInterval: ReviewInterval | null;
  nextReviewDate: string | null;
  lastReviewedOn: string | null;
}

export interface ReviewScheduleInput {
  reviewInterval?: unknown;
  nextReviewDate?: unknown;
}

/** 生效的回顾间隔：自身间隔，没有（存量或不合法数据）就用该对象类型的账号默认。 */
export function effectiveReviewInterval(
  reviewInterval: unknown,
  kind: ReviewDefaultKind,
  context: ReviewContext,
): ReviewInterval {
  return normalizeReviewInterval(reviewInterval) ?? context.defaults[kind];
}

/**
 * 新建 Project / Area（含 Repeat Project Instance 派生、转为项目）的回顾
 * 字段：间隔取该对象类型的账号默认，下次回顾日为今天加间隔，从未回顾；
 * 调用方显式传入间隔 / 下次回顾日时以传入值为准。
 */
export function planReviewSchedule(
  context: ReviewContext,
  kind: ReviewDefaultKind,
  input: ReviewScheduleInput = {},
  zones: CalendarZones = UTC_ZONES,
): { reviewInterval: ReviewInterval; nextReviewDate: string; lastReviewedOn: null } {
  const reviewInterval = effectiveReviewInterval(input.reviewInterval, kind, context);
  return {
    reviewInterval,
    nextReviewDate:
      dateKeyOf(input.nextReviewDate, zones) ?? addReviewInterval(context.today, reviewInterval),
    lastReviewedOn: null,
  };
}

/**
 * 标记已回顾：以原下次回顾日为锚点加间隔，仍不晚于今天就继续加到晚于今天
 * （11-01 每月 → 12-01；拖到 12-03 才回顾 → 01-01）；上次回顾日记为今天。
 * 间隔为空（存量数据）时同时写入按默认算出的间隔。
 */
export function planMarkReviewed(
  existing: ReviewScheduleInput,
  kind: ReviewDefaultKind,
  context: ReviewContext,
  zones: CalendarZones = UTC_ZONES,
): Partial<ReviewFields> {
  const own = normalizeReviewInterval(existing.reviewInterval);
  const interval = own ?? context.defaults[kind];
  const anchor = effectiveNextReviewDate(existing.nextReviewDate, context.today, zones);
  return {
    ...(own ? {} : { reviewInterval: interval }),
    nextReviewDate: advanceReviewDate(anchor, interval, context.today),
    lastReviewedOn: context.today,
  };
}

/**
 * 编辑回顾设置：改间隔只改间隔，不动下次回顾日；下次回顾日可直接改。
 * 不合法的间隔 / 日期忽略；上次回顾日不可编辑。
 */
export function planReviewUpdate(
  input: ReviewScheduleInput,
  zones: CalendarZones,
): Partial<ReviewFields> {
  const patch: Partial<ReviewFields> = {};
  if (input.reviewInterval !== undefined) {
    const interval = normalizeReviewInterval(input.reviewInterval);
    if (interval) patch.reviewInterval = interval;
  }
  if (input.nextReviewDate !== undefined) {
    const day = dateKeyOf(input.nextReviewDate, zones);
    if (day) patch.nextReviewDate = day;
  }
  return patch;
}

/** 回顾判定所需的项目字段。 */
export interface ReviewProjectFields extends Positioned {
  id: string;
  areaId?: string | null;
  status: unknown;
  trashedAt: unknown;
  nextReviewDate?: unknown;
}

export interface ReviewAreaFields extends Positioned {
  id: string;
  nextReviewDate?: unknown;
}

/** 参与回顾的项目：未了结、未进 Trash（含 Later Project）。Area 一律参与。 */
export function projectTakesPartInReview(project: {
  status: unknown;
  trashedAt: unknown;
}): boolean {
  return project.status === ProjectStatus.ACTIVE && project.trashedAt == null;
}

/** 生效的下次回顾日：空值（存量数据）视为今天。 */
export function effectiveNextReviewDate(
  nextReviewDate: unknown,
  today: string,
  zones: CalendarZones,
): string {
  return dateKeyOf(nextReviewDate, zones) ?? today;
}

/**
 * 回顾队列：待回顾（下次回顾日不晚于今天）的 Project 与 Area 混排。
 * 待回顾数即队列长度。
 */
export function buildReviewQueue(
  projects: readonly ReviewProjectFields[],
  areas: readonly ReviewAreaFields[],
  today: string,
  zones: CalendarZones,
): ReviewQueue {
  const parents = flatParentOrder(
    sortByEffectivePosition(projects.filter(projectTakesPartInReview)),
    sortByEffectivePosition(areas),
  );
  const entries = parents.map((parent, order) => {
    const row = parent.kind === 'project' ? parent.project : parent.area;
    return {
      item: { kind: parent.kind, id: row.id } as ReviewQueueItem,
      date: effectiveNextReviewDate(row.nextReviewDate, today, zones),
      order,
    };
  });
  const due = entries
    .filter((entry) => entry.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
  let upcoming: ReviewQueue['upcoming'] = null;
  for (const entry of entries) {
    if (entry.date <= today) continue;
    if (!upcoming || entry.date < upcoming.date) upcoming = { date: entry.date, count: 1 };
    else if (entry.date === upcoming.date) upcoming.count += 1;
  }
  return { items: due.map((entry) => entry.item), upcoming };
}
