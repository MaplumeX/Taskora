# 01 — Shared types: Change Event & Event Stream frames

Status: done

## Summary

Add `packages/shared/src/dtos/event.dto.ts` with:

- `ChangeEntity` (task / subtask / project / project-heading / area / tag / tag-group)
- `ChangeAction` (created / updated / deleted)
- `ChangeEventPayloadMap` — per-entity payload types (list DTO shapes)
- `ChangeEvent` — discriminated union carrying `seq`, `entity`, `action`, `id`, `data` (full entity for created/updated; absent for deleted)
- `EventStreamFrame` — `hello` (seq) / `change` (event) / `resync`

Exported from the shared index for backend + both clients.

## Acceptance

- `pnpm --filter @taskora/shared build` passes; types importable from `@taskora/shared`.
