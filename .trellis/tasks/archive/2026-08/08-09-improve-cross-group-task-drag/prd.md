# 优化任务跨分组拖动体验

## Goal

Improve project-page task organization so users can see the exact destination group and insertion position while dragging, before they commit a cross-group move.

## Background

- Heading-aware task grouping is intentionally project-page-only; aggregate lists continue to use the generic `TaskListView` (`.trellis/tasks/archive/2026-07/07-31-project-headings/design.md`).
- `ProjectTaskLayout` already models ungrouped tasks plus ordered heading containers, and the backend accepts one complete layout for atomic membership/order persistence.
- The current UI changes layout only in `onDragEnd`, so a cross-group move has no live destination gap (`packages/frontend/src/components/project/ProjectTaskLayout.tsx:316`).
- Dropping over a task currently inserts before it; dropping over a heading or container appends to that group (`packages/frontend/src/components/project/ProjectTaskLayout.tsx:132`).
- The current container feedback is a subtle `isOver` background tint and does not communicate an exact insertion position (`packages/frontend/src/components/project/ProjectTaskLayout.tsx:220`).
- One `closestCenter` collision strategy currently handles headings, tasks, and containers together (`packages/frontend/src/components/project/ProjectTaskLayout.tsx:336`).
- Existing tests cover final layout serialization but not live preview, before/after intent, cancellation, or compact drag overlays (`packages/frontend/src/components/project/ProjectTaskLayout.test.tsx:75`).

## Requirements

### R1 — Live task-drag preview

- A dragged task must render as a compact floating overlay that follows pointer or keyboard movement.
- The prospective destination must open a task-height placeholder before drop.
- The placeholder/insertion marker is the only destination emphasis; do not tint or highlight the target group background.
- Pointer placement over the upper/lower half of a task means insert before/after that task.

### R2 — Group target semantics

- Hovering a group heading means insert as the first task in that group.
- Hovering trailing blank space means append as the last task in that container.
- Empty groups must expose one clear, usable insertion slot.
- The ungrouped area must remain a valid destination and follow the same task/blank-space placement rules.

### R3 — Expanded task behavior

- Starting a drag on an expanded task must first blur the focused editor so existing blur-save behavior runs.
- The task must then collapse and participate in the drag as a compact row.
- The task remains collapsed after drop or cancellation; dragging is treated as leaving the editing context.

### R4 — Transient state and persistence

- Live hover changes are preview-only and must not call the reorder API.
- A successful changed drop must submit exactly one complete layout through the existing reorder mutation.
- A no-op drop must not submit a reorder mutation.
- Cancellation or dropping outside all valid targets must restore the drag-start layout and must not submit a mutation.
- A failed save must restore the latest server-derived layout and show the existing shared save-failed toast.

### R5 — Compatibility

- Same-group task sorting and whole-heading sorting must continue to work.
- Existing keyboard drag support must remain available; when pointer-half information is unavailable, keyboard movement may use deterministic item-index placement.
- Existing automatic scrolling near viewport/scroll-container edges must not regress.
- The change must stay inside the project heading layout and must not alter drag behavior in aggregate task lists, completed-task layouts, Area views, or the sidebar.

## Acceptance Criteria

- [ ] AC1 (R1): During a cross-group drag, a compact task overlay follows the drag while the destination list opens a task-height placeholder at the prospective location.
- [ ] AC2 (R1): Hovering the upper/lower half of a task previews insertion before/after that task.
- [ ] AC3 (R1): No destination group background tint or highlight appears during task dragging.
- [ ] AC4 (R2): Hovering a heading previews the task at the start of that group; hovering trailing blank space previews it at the end.
- [ ] AC5 (R2): Empty headings and the ungrouped container remain visible and usable as task drop targets.
- [ ] AC6 (R3): Starting a drag from an expanded task triggers blur-save, collapses it, and uses the compact overlay/placeholder; it remains collapsed after the drag finishes.
- [ ] AC7 (R4): Hover preview performs no network persistence; one changed successful drop produces exactly one complete-layout mutation.
- [ ] AC8 (R4): A no-op, cancelled, or outside-target drop produces no mutation; cancellation/outside drop restores the drag-start layout.
- [ ] AC9 (R4): Save failure restores the server-derived layout and shows `common:saveFailed` through the existing error path.
- [ ] AC10 (R5): Same-group task sorting, heading block sorting, pointer activation distance, keyboard dragging, and automatic scrolling do not regress.
- [ ] AC11 (R5): Focused unit/component tests cover cross-group before/after placement, heading-first, trailing/empty-container append, downward same-group index adjustment, no-op, and cancel/commit behavior.
- [ ] AC12: Frontend lint, typecheck, focused tests, and the full frontend test suite pass.

## Out of Scope

- Destination group background highlighting.
- A dedicated task drag handle or changes to the existing whole-row drag activation model.
- Drag sorting in `ProjectCompletedTasks`.
- Sidebar project/area drag-and-drop, Area detail ordering, or aggregate task-list drag-and-drop.
- Backend schema, DTO, endpoint, or reorder-mutation contract changes.
- New user-facing text or i18n keys.

## Risks and Deferred Items

- Nested heading/task/container droppables can cause target ambiguity; the implementation must use task-drag-specific collision priority and keep heading drag collision behavior isolated.
- Touch-only ergonomics beyond preserving the existing PointerSensor behavior are deferred; no dedicated touch handle is introduced.
- Visual tuning is limited to the compact overlay and insertion placeholder; broader task-row redesign is deferred.
