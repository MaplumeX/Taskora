/**
 * Review（回顾，见 CONTEXT.md）：Project / Area 的回顾排期规则。设备的
 * Engine 后端与 hub 的 REST 服务共用。
 *
 * 存量数据两个字段都可能为空：nextReviewDate 为空视为今天待回顾，
 * reviewInterval 为空按账号默认回顾间隔计算。新建与标记已回顾总写明确值。
 */

import {
  addReviewInterval,
  normalizeReviewInterval,
  ProjectStatus,
  type ReviewInterval,
  type ReviewQueue,
  type ReviewQueueItem,
} from '@taskora/shared';

import { dateKeyOf, type CalendarZones } from './calendar';
import { flatParentOrder, sortByEffectivePosition, type Positioned } from './order';

/** 输入的下次回顾日是日期键，与时区无关；只有旧的时刻编码才需要账号时区。 */
const UTC_ZONES: CalendarZones = { timeZone: 'UTC', legacyDateTimeZone: 'UTC' };

/** 回顾排期的上下文：账号时区的今天与账号默认回顾间隔。 */
export interface ReviewContext {
  today: string;
  defaultInterval: ReviewInterval;
}

export interface ReviewFields {
  reviewInterval: ReviewInterval | null;
  nextReviewDate: string | null;
}

export interface ReviewScheduleInput {
  reviewInterval?: unknown;
  nextReviewDate?: unknown;
}

/** 生效的回顾间隔：自身间隔，没有（或不合法）就用账号默认。 */
export function effectiveReviewInterval(
  reviewInterval: unknown,
  defaultInterval: ReviewInterval,
): ReviewInterval {
  return normalizeReviewInterval(reviewInterval) ?? defaultInterval;
}

/**
 * 新建 Project / Area（含 Repeat Project Instance 派生、转为项目）的回顾
 * 字段：间隔取账号默认，下次回顾日为今天加间隔；调用方显式传入时以传入
 * 值为准。
 */
export function planReviewSchedule(
  context: ReviewContext,
  input: ReviewScheduleInput = {},
  zones: CalendarZones = UTC_ZONES,
): { reviewInterval: ReviewInterval; nextReviewDate: string } {
  const reviewInterval = effectiveReviewInterval(input.reviewInterval, context.defaultInterval);
  return {
    reviewInterval,
    nextReviewDate:
      dateKeyOf(input.nextReviewDate, zones) ?? addReviewInterval(context.today, reviewInterval),
  };
}

/**
 * 标记已回顾：下次回顾日为今天加生效间隔（错过多久都从今天重新计）；
 * 间隔为空时同时写入默认间隔，固化下来。
 */
export function planMarkReviewed(
  existing: { reviewInterval?: unknown },
  context: ReviewContext,
): Partial<ReviewFields> {
  const own = normalizeReviewInterval(existing.reviewInterval);
  const interval = own ?? context.defaultInterval;
  return {
    ...(own ? {} : { reviewInterval: interval }),
    nextReviewDate: addReviewInterval(context.today, interval),
  };
}

/**
 * 编辑回顾设置：改间隔只改间隔，不动下次回顾日。不合法的间隔 / 日期忽略。
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
