/**
 * 领域规则（@taskora/engine domain）的 wire 形态 ↔ Postgres 存储形态。
 *
 * 规则函数返回的日历日期是 `YYYY-MM-DD` 日期键、时间戳是 ISO 字符串、
 * 重复规则是规范化对象；Prisma 列分别是 UTC 零点的 DateTime、DateTime
 * 与规范 JSON 文本。标签（tagIds）走关系表，由调用方单独写。
 */

import { canonicalRepeatRule } from '@taskora/engine';
import { calendarDateStorage, type RepeatRule } from '@taskora/shared';

import type { PrismaService } from '../prisma/prisma.service';
import { userCalendarZones } from '../users/account-time-zone';

const DATE_KEY_FIELDS = new Set(['scheduledDate', 'dueDate']);
const INSTANT_FIELDS = new Set(['settledAt', 'trashedAt', 'completedAt']);

/**
 * 字段补丁 → Prisma unchecked data（外键为标量列）。tagIds 被剔除；
 * 其余字段按名换成存储形态。
 */
export function toPrismaData(patch: object): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (field === 'tagIds' || value === undefined) continue;
    if (DATE_KEY_FIELDS.has(field)) {
      data[field] = typeof value === 'string' ? calendarDateStorage(value) : null;
    } else if (INSTANT_FIELDS.has(field)) {
      data[field] = typeof value === 'string' ? new Date(value) : null;
    } else if (field === 'repeatRule') {
      data[field] = value === null ? null : canonicalRepeatRule(value as RepeatRule);
    } else {
      data[field] = value;
    }
  }
  return data;
}

/** 视图判定的上下文：只有 Today / Upcoming 需要查账户时区。 */
export async function calendarContextFor(
  prisma: PrismaService,
  userId: string,
  needsCalendar: boolean,
) {
  const zones = needsCalendar
    ? await userCalendarZones(prisma, userId)
    : { timeZone: 'UTC', legacyDateTimeZone: 'UTC' };
  return { ...zones, now: new Date() };
}

/** 一批项目的进度计数所需的任务字段（规则见 domain countProjectTasks）。 */
export function countedTasksOf(prisma: PrismaService, userId: string, projectIds: string[]) {
  return prisma.task.findMany({
    where: { userId, projectId: { in: projectIds }, trashedAt: null },
    select: { projectId: true, status: true, trashedAt: true },
  });
}

/**
 * 规则给出的逐行补丁按内容分组：同一补丁的行合成一次 updateMany
 * （级联操作的补丁通常完全相同）。
 */
export function groupPatches<P extends object>(
  items: ReadonlyArray<{ id: string; patch: P }>,
): Array<{ ids: string[]; data: Record<string, unknown> }> {
  const groups = new Map<string, { ids: string[]; data: Record<string, unknown> }>();
  for (const { id, patch } of items) {
    const data = toPrismaData(patch);
    const key = JSON.stringify(data);
    const group = groups.get(key) ?? { ids: [], data };
    group.ids.push(id);
    groups.set(key, group);
  }
  return [...groups.values()];
}
