# Research: stale preview outside valid drop targets

## Local evidence

- `ProjectTaskLayout` uses pointer-based collision detection for task dragging. When the pointer intersects no compatible task, container, or heading droppable, collision detection returns an empty list.
- `handleDragOver` currently leaves the rendered local layout at the last valid preview position when `over` is null.
- `handleDragEnd` handles the same `over === null` state differently: it restores the drag-start snapshot and performs no persistence.
- The mismatch is therefore caused by two event paths assigning different meanings to the same visible preview: drag-over keeps it, while drag-end discards it.
- Existing tests encode outside release as cancellation, but the user has explicitly selected sticky last-valid-target behavior instead.

## Confirmed product decision

- The actual drop must always match the visible preview.
- When the pointer leaves all valid targets, keep the last valid preview.
- Releasing outside commits that preview when it differs from the drag-start layout.
- Escape/drag cancellation still restores the snapshot and performs no persistence.

## Minimal correction

- In the task `onDragEnd` path with `over === null`, use the currently rendered preview layout as the final layout rather than restoring solely because the current collision is empty.
- Persist exactly once only when that preview differs from the drag-start snapshot; otherwise cleanly restore/no-op without persistence.
- Keep `onDragCancel` unchanged as the explicit cancellation path.
- Replace the old outside-drop restoration test with focused coverage for sticky preview commit, no-op outside release, re-entry updating the sticky preview, and Escape cancellation.

## Boundaries

- Do not change target priority, before/after geometry, keyboard behavior, heading dragging, backend code, or visual styling.
