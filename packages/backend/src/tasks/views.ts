import { TaskBucket, TaskStatus, ScheduledType } from '@taskora/shared';
import { Prisma } from '@prisma/client';

export type TaskView =
  | 'inbox'
  | 'today'
  | 'upcoming'
  | 'anytime'
  | 'someday'
  | 'trash'
  | 'logbook';

/**
 * Build the Prisma `where` clause for a given view.
 * Extracted from TasksService.findAll so FeedService can reuse the same logic.
 *
 * Returns only the view-specific conditions (not userId — caller must add that).
 */
export function buildTaskViewWhere(
  view: TaskView,
): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};
  switch (view) {
    case 'inbox':
      where.bucket = TaskBucket.INBOX;
      where.status = TaskStatus.ACTIVE;
      where.scheduledType = ScheduledType.NONE;
      break;
    case 'today':
      where.status = TaskStatus.ACTIVE;
      where.scheduledType = ScheduledType.DATE;
      where.scheduledDate = { lte: new Date() };
      break;
    case 'upcoming':
      where.status = TaskStatus.ACTIVE;
      where.scheduledType = ScheduledType.DATE;
      where.scheduledDate = { gt: new Date() };
      break;
    case 'anytime':
      where.bucket = TaskBucket.ANYTIME;
      where.status = TaskStatus.ACTIVE;
      where.scheduledType = ScheduledType.NONE;
      break;
    case 'someday':
      where.scheduledType = ScheduledType.SOMEDAY;
      where.status = TaskStatus.ACTIVE;
      break;
    case 'trash':
      where.status = TaskStatus.TRASHED;
      break;
    case 'logbook':
      where.status = TaskStatus.COMPLETED;
      break;
  }
  return where;
}