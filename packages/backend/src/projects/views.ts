import { ProjectBucket, ProjectStatus, ScheduledType } from '@taskora/shared';
import { Prisma } from '@prisma/client';

export type ProjectView =
  | 'inbox'
  | 'today'
  | 'upcoming'
  | 'anytime'
  | 'someday'
  | 'trash'
  | 'logbook';

/**
 * Build the Prisma `where` clause for a given view (Project version).
 * Same semantics as buildTaskViewWhere but for Project model (no parentId/projectId).
 *
 * Returns only the view-specific conditions (not userId — caller must add that).
 */
export function buildProjectViewWhere(
  view: ProjectView,
): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = {};
  switch (view) {
    case 'inbox':
      where.bucket = ProjectBucket.INBOX;
      where.status = ProjectStatus.ACTIVE;
      where.scheduledType = ScheduledType.NONE;
      where.trashedAt = null;
      break;
    case 'today':
      where.status = ProjectStatus.ACTIVE;
      where.scheduledType = ScheduledType.DATE;
      where.scheduledDate = { lte: new Date() };
      where.trashedAt = null;
      break;
    case 'upcoming':
      where.status = ProjectStatus.ACTIVE;
      where.scheduledType = ScheduledType.DATE;
      where.scheduledDate = { gt: new Date() };
      where.trashedAt = null;
      break;
    case 'anytime':
      where.bucket = ProjectBucket.ANYTIME;
      where.status = ProjectStatus.ACTIVE;
      where.scheduledType = ScheduledType.NONE;
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