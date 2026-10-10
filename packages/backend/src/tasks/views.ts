export { hidesTasksInLaterProjects } from '@taskora/shared';

import {
  instantDateKey,
  isLaterProject,
  ProjectStatus,
  TaskBucket,
  TaskStatus,
  ScheduledType,
  SETTLED_TASK_STATUSES,
  WITH_SETTLED_TASK_STATUSES,
} from '@taskora/shared';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export type TaskView =
  'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'trash' | 'logbook' | 'deadlines';

/** 已了结（Settled）状态白名单（ADR 0006）：单一来源在 @taskora/shared，前后端共用。 */
export const SETTLED_STATUSES = SETTLED_TASK_STATUSES;

/** 含已了结项的查询白名单：搜索 / Agent list_tasks 等含 completed=true 语义的路径。 */
export const WITH_SETTLED_STATUSES = WITH_SETTLED_TASK_STATUSES;

/**
 * 视图的 SQL 粗筛（Prisma `where`）。视图规则本身在 @taskora/engine 的
 * domain taskMatchesView（与设备共用），服务在查询后按它做最终过滤；这里
 * 只负责少读行，条件只能比规则宽、不能比它窄。
 *
 * Returns only the view-specific conditions (not userId — caller must add that).
 */
export function buildTaskViewWhere(
  view: TaskView,
  keepsSettled = false,
): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};
  // 非立即模式下这些视图还留着尚未移入 Logbook 的已了结任务（ADR 0022）
  const listed = keepsSettled ? undefined : TaskStatus.ACTIVE;
  switch (view) {
    case 'inbox':
      where.bucket = TaskBucket.INBOX;
      where.status = listed;
      where.scheduledType = ScheduledType.NONE;
      where.trashedAt = null;
      break;
    case 'today':
      where.status = listed;
      // 计划日期或截止日期到了都进 Today；日历判定由调用方按账号时区做。
      // 用 AND 包一层：调用方的 where.OR（搜索词）不会被覆盖。
      where.AND = [
        {
          OR: [
            { scheduledType: ScheduledType.DATE, scheduledDate: { not: null } },
            { dueDate: { not: null } },
          ],
        },
      ];
      where.trashedAt = null;
      break;
    case 'upcoming':
      where.status = listed;
      where.scheduledType = ScheduledType.DATE;
      where.scheduledDate = { not: null };
      where.trashedAt = null;
      break;
    case 'anytime':
      where.bucket = TaskBucket.ANYTIME;
      where.status = listed;
      where.scheduledType = ScheduledType.NONE;
      where.trashedAt = null;
      break;
    case 'someday':
      where.scheduledType = ScheduledType.SOMEDAY;
      where.status = listed;
      where.trashedAt = null;
      break;
    case 'trash':
      where.trashedAt = { not: null };
      break;
    case 'logbook':
      // Logbook = 已了结（完成 + 取消）任务的档案，按了结时间排序。
      where.status = { in: [...SETTLED_STATUSES] };
      where.trashedAt = null;
      break;
    case 'deadlines':
      where.status = TaskStatus.ACTIVE;
      where.dueDate = { not: null };
      where.trashedAt = null;
      break;
  }
  return where;
}

/**
 * 稍后项目（Later Project，见 CONTEXT.md）id 集合：Anytime / Someday 中其内任务随父项目休眠。
 * 「未来日期」依赖账号时区，故在内存中按共享判定函数计算。
 */
export async function laterProjectIds(
  prisma: PrismaService,
  userId: string,
  zones: { timeZone: string; legacyDateTimeZone: string },
  now = new Date(),
): Promise<Set<string>> {
  const candidates = await prisma.project.findMany({
    where: {
      userId,
      status: ProjectStatus.ACTIVE,
      trashedAt: null,
      scheduledType: { in: [ScheduledType.SOMEDAY, ScheduledType.DATE] },
    },
    select: { id: true, status: true, trashedAt: true, scheduledType: true, scheduledDate: true },
  });
  const today = instantDateKey(now, zones.timeZone);
  return new Set(
    candidates
      .filter((project) => isLaterProject(project, today, zones.legacyDateTimeZone))
      .map((project) => project.id),
  );
}
