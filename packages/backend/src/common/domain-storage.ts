/**
 * 领域规则（@taskora/engine domain）与 hub 写入 / Postgres 读取之间的
 * 形态衔接。
 *
 * 规则函数返回的是 wire 形态（日历日期为 `YYYY-MM-DD` 日期键、时间戳为
 * ISO 字符串、重复规则为对象），与设备推送同形：REST 服务把它原样交给
 * SyncHubService.writeAsHub，由 hub 的实体编解码器落成 Postgres 存储形态。
 */

import type { Prisma } from '@prisma/client';
import { canonicalRepeatRule } from '@taskora/engine';
import type { RepeatRule } from '@taskora/shared';

import type { PrismaService } from '../prisma/prisma.service';
import { userCalendarZones } from '../users/account-time-zone';

/**
 * 规则补丁 → hub 字段写：去掉 undefined，重复规则换成规范形对象（与
 * 设备写同一键序，落库的 JSON 文本逐字一致）。
 */
export function toWireFields(patch: object): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields[field] =
      field === 'repeatRule' && value !== null
        ? JSON.parse(canonicalRepeatRule(value as RepeatRule))
        : value;
  }
  return fields;
}

/**
 * 本用户某实体列表两端的 Position（新建置顶 / 追加末尾的邻居）。只取一行：
 * Postgres 的默认排序规则不是字节序，用 COLLATE "C" 与设备副本、domain
 * sortByEffectivePosition 同一口径。
 */
export async function edgePositions(
  client: Pick<Prisma.TransactionClient, '$queryRawUnsafe'>,
  table: 'Task' | 'Project' | 'Tag',
  userId: string,
): Promise<{ first: string | null; last: string | null }> {
  const edge = async (direction: 'ASC' | 'DESC') => {
    const rows = await client.$queryRawUnsafe<Array<{ position: string }>>(
      `SELECT "position" FROM "${table}" WHERE "userId" = $1 AND "position" IS NOT NULL ORDER BY "position" COLLATE "C" ${direction} LIMIT 1`,
      userId,
    );
    return rows[0]?.position ?? null;
  };
  return { first: await edge('ASC'), last: await edge('DESC') };
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
