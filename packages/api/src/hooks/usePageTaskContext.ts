import { useCalendarDay } from './useCalendarDay';
import { todayDateKey } from '@/utils/date';
import { useLocation, useParams } from 'react-router-dom';

import { ScheduledType, TaskBucket } from '@taskora/shared';

import type { CreateTaskDto } from '@taskora/shared';

type PageTaskContext = Omit<Partial<CreateTaskDto>, 'title'>;

/**
 * Resolves the current page's task-creation context.
 * Returns a partial CreateTaskDto to spread into the payload.
 */
export function usePageTaskContext(): PageTaskContext {
  useCalendarDay();
  const { pathname } = useLocation();
  const params = useParams<{ id: string; tagId: string }>();

  if (pathname === '/today') {
    return {
      scheduledType: ScheduledType.DATE,
      scheduledDate: todayDateKey(),
    };
  }

  if (pathname === '/someday') {
    return { scheduledType: ScheduledType.SOMEDAY };
  }

  if (pathname === '/anytime') {
    return { bucket: TaskBucket.ANYTIME };
  }

  if (pathname.startsWith('/projects/') && params.id) {
    return { projectId: params.id };
  }

  if (pathname.startsWith('/areas/') && params.id) {
    return { areaId: params.id };
  }

  if (pathname.startsWith('/tags/') && params.tagId) {
    return { tagIds: [params.tagId] };
  }

  return {};
}
