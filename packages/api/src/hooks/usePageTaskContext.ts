import { useCalendarDay } from './useCalendarDay';
import { todayDateKey } from '@/utils/date';
import { useLocation, useParams } from 'react-router-dom';

import { reviewDetailOf } from './reviewRoute';

import { ScheduledType, TaskBucket, addCalendarDays } from '@taskora/shared';

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

  // Upcoming / Tomorrow 新建的任务计划为明天（对齐 Things 3：Upcoming 点按 Magic Plus）
  if (pathname === '/upcoming' || pathname === '/tomorrow') {
    return {
      scheduledType: ScheduledType.DATE,
      scheduledDate: addCalendarDays(todayDateKey(), 1),
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

  const review = reviewDetailOf(pathname);
  if (review) return review.view === 'projects' ? { projectId: review.id } : { areaId: review.id };

  if (pathname.startsWith('/tags/') && params.tagId) {
    return { tagIds: [params.tagId] };
  }

  return {};
}
