import { ProjectStatus, ScheduledType } from '@taskora/shared';
import { Prisma } from '@prisma/client';

export type ProjectView =
  'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'trash' | 'logbook';

/**
 * 视图的 SQL 粗筛（Prisma `where`）。视图规则本身在 @taskora/engine 的
 * domain projectMatchesView（与设备共用），服务在查询后按它做最终过滤；这里
 * 只负责少读行，条件只能比规则宽、不能比它窄。
 *
 * Returns only the view-specific conditions (not userId — caller must add that).
 */
export function buildProjectViewWhere(view: ProjectView): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = {};
  switch (view) {
    case 'inbox':
    case 'anytime':
      // Projects never appear in the inbox or anytime feeds.
      // id < '' never matches — defensive guard against accidental reuse.
      where.id = { lt: '' };
      break;
    case 'today':
      where.status = ProjectStatus.ACTIVE;
      where.scheduledType = ScheduledType.DATE;
      where.scheduledDate = { not: null }; // Calendar predicate is applied by the caller in the account zone.
      where.trashedAt = null;
      break;
    case 'upcoming':
      where.status = ProjectStatus.ACTIVE;
      where.scheduledType = ScheduledType.DATE;
      where.scheduledDate = { not: null };
      where.trashedAt = null;
      break;
    case 'someday':
      where.scheduledType = ScheduledType.SOMEDAY;
      where.status = ProjectStatus.ACTIVE;
      where.trashedAt = null;
      break;
    case 'trash':
      where.trashedAt = { not: null };
      break;
    case 'logbook':
      where.status = ProjectStatus.COMPLETED;
      where.trashedAt = null;
      break;
  }
  return where;
}
