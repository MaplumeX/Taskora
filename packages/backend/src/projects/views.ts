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
      break;
    case 'today':
      where.status = ProjectStatus.ACTIVE;
      where.scheduledType = ScheduledType.DATE;
      where.scheduledDate = { lte: new Date() };
      break;
    case 'upcoming':
      where.status = ProjectStatus.ACTIVE;
      where.scheduledType = ScheduledType.DATE;
      where.scheduledDate = { gt: new Date() };
      break;
    case 'anytime':
      where.bucket = ProjectBucket.ANYTIME;
      where.status = ProjectStatus.ACTIVE;
      where.scheduledType = ScheduledType.NONE;
      break;
    case 'someday':
      where.scheduledType = ScheduledType.SOMEDAY;
      where.status = ProjectStatus.ACTIVE;
      break;
    case 'trash':
      where.status = ProjectStatus.TRASHED;
      break;
    case 'logbook':
      where.status = ProjectStatus.COMPLETED;
      break;
  }
  return where;
}