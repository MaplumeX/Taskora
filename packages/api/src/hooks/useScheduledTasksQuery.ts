import { useTasksQuery } from './useTasks';

/**
 * All non-trashed tasks (ACTIVE + COMPLETED) that have a scheduledDate.
 * Server-side filtered via the `hasScheduled` query param; grouped client-side
 * by the calendar page.
 */
export function useScheduledTasksQuery() {
  return useTasksQuery({ completed: true, hasScheduled: true });
}
