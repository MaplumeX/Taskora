# Design: cross-group task drag preview

## 1. Scope and boundaries

The change is frontend-only and remains owned by `ProjectTaskLayout`. The existing shared DTO, project-heading reorder endpoint, backend validation, and `useReorderProjectHeadingLayout` mutation already support the required final state.

Primary production file:

- `packages/frontend/src/components/project/ProjectTaskLayout.tsx`

Primary test file:

- `packages/frontend/src/components/project/ProjectTaskLayout.test.tsx`

No generic `TaskList`, completed-task layout, sidebar, API, backend, schema, or i18n changes are planned.

## 2. Drag session state

Keep server-derived layout state separate from the transient drag session:

```text
layout                    currently rendered preview layout
dragStartLayoutRef        immutable snapshot captured at task drag start
activeTaskId              task rendered in DragOverlay and as destination placeholder
activeTask                task DTO used by the compact overlay
```

Rules:

- Prop changes normalize into `layout` only when no task drag is active.
- Task drag start clones the current layout into `dragStartLayoutRef`.
- `onDragOver` mutates only the local preview layout.
- Cancel/outside drop restores `dragStartLayoutRef`.
- Changed valid drop persists the current preview once.
- Cleanup always clears the active task and snapshot.

Heading dragging continues to use the existing final `applyLayoutDrag`/persist path and does not enter the task preview session.

## 3. Expanded task transition

On task drag start:

1. If focus is inside the active `[data-task-item]`, call `blur()` so title/notes blur-save handlers run before the editor unmounts.
2. Call the existing selection blank action to clear selected/expanded task UI state.
3. Store the active task and layout snapshot.

The overlay always renders the compact/idle form of `TaskItem`. It is wrapped with `pointer-events-none` so checkbox/context-menu controls are visual only during the drag. The task stays collapsed after drop or cancellation by product decision.

## 4. Collision and target resolution

Use different policies by active entity type.

### Heading drag

Restrict candidates to `heading:*` droppables and retain center-based vertical block ordering. Tasks and containers must not steal heading collisions.

### Task drag

For pointer input:

1. Use pointer intersection candidates.
2. Prefer `task:*` candidates, then `container:*` candidates.
3. Use `heading:*` only when no nested task/container candidate exists; this represents the heading-row target and inserts at index `0`.
4. When over `task:*`, compare pointer Y with the task rectangle midpoint to select before or after.

For keyboard input, where pointer coordinates are unavailable, use `closestCenter` over compatible candidates and deterministic item-index placement. This preserves the existing KeyboardSensor rather than removing accessibility support.

Target mapping:

| Collision target | Placement |
|---|---|
| `task:<id>` upper half | before hovered task |
| `task:<id>` lower half | after hovered task |
| `heading:<id>` | index `0` in that heading |
| `container:<id>` | end of that container |
| no compatible target | invalid; restore on end/cancel |

The ungrouped container uses the same container/task rules but has no heading target.

## 5. Pure layout transition helpers

Refactor task placement into pure, exported helpers separate from DOM events:

```ts
interface TaskPlacement {
  containerId: ContainerId;
  index: number;
}

resolveTaskPlacement(layout, overKey, edge): TaskPlacement | null
moveTaskToPlacement(layout, activeTaskId, placement): LayoutState | null
```

`moveTaskToPlacement` clones affected arrays, removes the active task, adjusts a same-container destination index when removal occurs before insertion, clamps the final index, and returns `null` for an unchanged result. This prevents the common downward-move off-by-one error and keeps hover updates idempotent.

The existing heading transition remains independently testable. `serializeLayout` remains unchanged.

## 6. Rendering

- Keep `<DragOverlay>` mounted inside `DndContext`; conditionally render its compact task child.
- During an active task drag, render the active task's in-list sortable node as a task-height transparent spacer with a primary-colored insertion marker, not the full task row.
- Remove the current container `isOver` background class entirely for task dragging; no group tint is introduced.
- Keep empty containers at a usable minimum height so their single placeholder slot can be reached.
- Use theme tokens (`primary`, `border`, `card`) and existing row dimensions; do not add hard-coded light/dark colors or new copy.
- Preserve dnd-kit's automatic scrolling and existing PointerSensor activation distance of 5 px.

## 7. Event flow

```text
task drag start
  -> blur active editor -> collapse row -> snapshot layout -> show overlay

task drag over valid target
  -> resolve target/edge -> compute immutable preview -> render placeholder
  -> no mutation/API call

task drag end with changed valid preview
  -> clear drag session -> persist one serialized complete layout

task drag end outside / drag cancel
  -> restore snapshot -> clear drag session -> no persistence

heading drag end
  -> existing heading reorder calculation -> existing persistence path
```

## 8. Server synchronization and failure behavior

`useReorderProjectHeadingLayout` remains the only persistence boundary. It already performs the project's half-optimistic cache update and invalidates on error/settlement. `ProjectTaskLayout.persist` keeps the existing `onError` normalization and `common:saveFailed` toast.

If remote task/heading data changes during a local drag, prop normalization is deferred until the task drag ends. A stale complete-layout submission is rejected by existing backend exact-ID validation; the existing error path then restores server truth.

## 9. Validation strategy

Pure helper tests cover:

- cross-group insertion before and after a task;
- heading target inserts first;
- non-empty/empty container target appends last;
- movement to/from ungrouped;
- same-container upward and downward movement with index correction;
- unchanged placement returns `null` and input layout remains immutable.

Focused component/event tests cover:

- task preview does not call persistence during hover;
- changed drop calls persistence once;
- no-op/cancel/outside drop calls persistence zero times and restores the snapshot;
- expanded drag blurs and collapses before compact preview;
- heading drag still follows the existing persistence path;
- no destination background tint is rendered.

## 10. Rollback

All product changes are isolated to the project layout component and its tests. Reverting those edits restores the prior drop-on-end behavior; no data migration, API rollback, or cache migration is required.
