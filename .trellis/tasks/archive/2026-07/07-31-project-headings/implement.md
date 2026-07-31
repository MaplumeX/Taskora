# Implement: Project Headings

## Preconditions

- [ ] User approves the latest planning summary.
- [ ] `implement.jsonl` and `check.jsonl` contain real spec entries.
- [ ] Task is started with `task.py start`.

## Implementation checklist

### 1. Schema and shared contracts

- [ ] Add `ProjectHeading`, inverse relations, and nullable `Task.headingId` to Prisma schema.
- [ ] Add an additive migration with indexes and `ON DELETE` behavior matching `design.md`.
- [ ] Add shared heading CRUD/layout DTO interfaces and export them.
- [ ] Add `headingId` to task response/feed contracts where task DTO shape is projected.
- [ ] Build `@taskora/shared` and regenerate Prisma Client.

Validation:

```bash
pnpm --filter @taskora/shared build
pnpm --filter @taskora/backend prisma:generate
```

Rollback point: revert the additive schema/API contract before frontend work if generation or migration validation fails.

### 2. Backend heading domain

- [ ] Add project-heading DTO validation classes, module, controller, and service.
- [ ] Implement ownership-scoped list/create/update.
- [ ] Implement append-at-end creation.
- [ ] Implement atomic complete-layout reorder with duplicate, omission, ownership, project, and top-level validation.
- [ ] Implement confirmed heading deletion with descendant BFS and task soft deletion.
- [ ] Register the module in `AppModule`.
- [ ] Clear task heading membership when a task leaves its project.
- [ ] Ensure project soft delete/restore preserves headings and permanent project deletion cascades safely.

Tests:

- [ ] Service tests cover CRUD ownership and append order.
- [ ] Reorder tests cover same-group, cross-group, ungrouped, empty group, duplicate, omitted, foreign, cross-project, and child-task inputs.
- [ ] Delete tests cover empty heading, direct tasks, descendants, completed tasks, status preservation, and restored-task ungrouped semantics.
- [ ] Project trash/restore regression test proves headings and membership survive.

Validation:

```bash
pnpm --filter @taskora/backend test
pnpm --filter @taskora/backend typecheck
```

Rollback point: backend endpoints are isolated behind a new module; revert module registration if integration blocks.

### 3. Frontend data layer

- [ ] Add typed project-heading API functions.
- [ ] Add project-scoped query keys and CRUD/layout hooks.
- [ ] Invalidate heading/task queries after mutations.
- [ ] Add half-optimistic layout cache updates with invalidation recovery.
- [ ] Add hook tests for query scoping, invalidation, and reorder error recovery.

Validation:

```bash
pnpm --filter @taskora/frontend test
pnpm --filter @taskora/frontend typecheck
```

### 4. Heading-aware project UI

- [ ] Add a reusable heading row with inline edit, drag affordance, menu, and destructive confirmation dialog.
- [ ] Add a project-only normalized task layout with an ungrouped container and empty-heading drop zones.
- [ ] Implement heading block reorder and task same-/cross-container drag.
- [ ] Reuse existing task completion, selection, expansion, and row rendering behavior.
- [ ] Integrate loading/error handling for tasks and headings in `ProjectDetail`.
- [ ] Ensure a save failure restores server-confirmed state and shows a toast.
- [ ] Add component tests for grouping, empty headings, editing, deletion confirmation, and DnD layout serialization.

Rollback point: `ProjectDetail` can be switched back to `TaskListView` without changing generic list behavior.

### 5. Creation entry and i18n

- [ ] Add the project-only Heading button to `ContentBottomBar`.
- [ ] Create at the end and transfer focus through pending-auto-edit state.
- [ ] Add matching Chinese/English project namespace keys.
- [ ] Verify button accessible name, focus behavior, confirmation focus handling, and keyboard DnD attributes.
- [ ] Verify zh/en key parity.

### 6. Full verification and documentation

- [ ] Run focused tests during development.
- [ ] Run the Trellis quality check against requirements and design.
- [ ] Run all root quality gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

- [ ] Manually verify: legacy project, create/edit empty heading, drag heading, drag task across every container, delete with cancel/confirm, trash restore, project trash/restore, refresh persistence, and both locales.
- [ ] Update frontend/backend Trellis specs with the new heading contracts and DnD/layout conventions.
- [ ] Review the migration and changed files before commit.

## Risky files and rollback notes

- `packages/backend/prisma/schema.prisma` and the new migration own persistence compatibility.
- `packages/backend/src/tasks/tasks.service.ts` must preserve existing bucket, trash, restore, and subtask behavior while clearing invalid heading membership.
- `packages/frontend/src/pages/ProjectDetail.tsx` is the integration boundary; generic task pages must remain untouched.
- DnD changes should live in new project-specific components rather than broad rewrites of `TaskList`.
