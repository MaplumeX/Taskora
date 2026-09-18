# 04 — API package: event applier + task query matcher

Status: done

## Summary

- `src/events/task-query-match.ts` — pure port of the backend task list
  semantics (view filters + plain query filters) so the applier can decide
  list membership for a task payload.
- `src/events/event-applier.ts` — pure logic over a real `QueryClient`:
  upsert into matching lists, remove from non-matching ones, merge task
  detail caches (keeping embedded subtasks), parent-task surgery for subtask
  events, project-heading membership by `{projectId, includeArchived}`,
  feed/tag-group caches invalidated as fallback, unknown cases fall back to
  `invalidateQueries`.
- `src/events/event-applier` batches events on a ~50ms window before applying
  (one render per burst).

## Acceptance

`src/events/event-applier.test.ts` with a real QueryClient + seeded caches:
upsert, cross-list removal, detail overwrite, subtask nesting, coalescing,
fallback invalidate.
