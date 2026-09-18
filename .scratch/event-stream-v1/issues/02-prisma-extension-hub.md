# 02 — Backend: Prisma extension + collector + hub (event production)

Status: done

## Summary

- `src/events/change-event-hub.service.ts` — per-user monotonic seq (seeded from
  `Date.now()` at first touch), ~500-event ring buffer, subscribe/publish.
- `src/events/change-event.collector.ts` — collects write descriptors from a
  Prisma query extension; defers payload refetch + publish until every
  transaction settles (tx depth counter); dedupes per entity (created+updated →
  created; anything+deleted → deleted; created+deleted → dropped); re-verifies
  deleted rows at flush time so rolled-back transactions emit nothing harmful.
- `src/prisma/prisma.service.ts` — becomes a delegating wrapper around the
  extended client (model getters + `$transaction` wrapped with the collector's
  transaction scope).
- Covered models: Task, Subtask, Project, ProjectHeading, Area, Tag, TagGroup;
  relation tables TaskTag/ProjectTag/AreaTag map to parent entity `updated`.
- `convertToProject`'s `task.createMany` becomes per-row `task.create` so the
  promoted subtasks get individual created events (createMany returns no ids).

## Acceptance

Integration spec `test/change-events.service.spec.ts` (real test DB, real
services) asserts event sequences: create/update/soft-delete actions, payload
shape (Task DTO with embedded tags, no subtasks), TaskTag → parent mapping,
transaction merging, seq monotonicity, hard-delete events, rollback safety.
