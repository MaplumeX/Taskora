import { useTasksQuery } from './useTasks';

/**
 * All non-trashed tasks (ACTIVE + COMPLETED) that have a dueDate.
 * Server-side filtered via the `hasDue` query param; grouped client-side
 * by the calendar page.
 */
export function useDueTasksQuery() {
  return useTasksQuery({ completed: true, hasDue: true });
}
