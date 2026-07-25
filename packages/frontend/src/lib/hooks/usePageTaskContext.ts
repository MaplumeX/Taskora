import { useLocation, useParams } from 'react-router-dom';

import { ScheduledType } from '@taskora/shared';

import type { CreateTaskDto } from '@taskora/shared';

/**
 * Resolves the current page's task-creation context.
 * Returns a partial CreateTaskDto to spread into the payload.
 */
export function usePageTaskContext(): Partial<
  Pick<CreateTaskDto, 'scheduledType' | 'scheduledDate' | 'projectId'>
> {
  const { pathname } = useLocation();
  const params = useParams<{ id: string }>();

  if (pathname === '/today') {
    return {
      scheduledType: ScheduledType.DATE,
      scheduledDate: new Date().toISOString(),
    };
  }

  if (pathname === '/someday') {
    return { scheduledType: ScheduledType.SOMEDAY };
  }

  // /projects/:id
  if (pathname.startsWith('/projects/') && params.id) {
    return { projectId: params.id };
  }

  return {};
}