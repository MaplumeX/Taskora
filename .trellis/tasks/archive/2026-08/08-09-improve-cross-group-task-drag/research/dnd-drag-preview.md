# Research: cross-container task drag preview

## Local evidence

- Installed versions: `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, and `@dnd-kit/utilities` 3.2.2 (`packages/frontend/package.json`).
- No existing Taskora component uses `DragOverlay`, `onDragOver`, `onDragCancel`, or pointer-first collision detection.
- `ProjectTaskLayout` already owns a normalized multi-container layout and serializes one complete payload, so no backend or query-contract change is required.
- The existing task drag source may be an expanded editor because sortable listeners wrap the complete `TaskItem`; the shared selection hook exposes a blank-click action that collapses selection/expansion after blur-save.
- The heading sortable node wraps the full heading block, while task containers and task rows are nested droppables. A task-specific collision policy must therefore prefer task rows, then task containers, then the heading block as the header fallback.

## Official dnd-kit guidance

- The legacy React API documentation for the installed `@dnd-kit/core` line recommends `DragOverlay` when an item moves between containers, because the source may unmount in one container and mount in another during the drag: <https://docs.dndkit.com/api-documentation/draggable/drag-overlay>.
- The same documentation says the `DragOverlay` component should remain mounted and its children should be conditional, so drop animation measurement remains valid.
- `pointerWithin` is pointer-specific; keyboard dragging therefore needs a geometry fallback such as `closestCenter`: <https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms>.
- The sortable preset documentation describes multi-container sorting through `onDragOver`, inserting an item into the new container during the drag; final persistence remains an application concern: <https://docs.dndkit.com/presets/sortable>.

## Design implications

- Keep the overlay mounted for the lifetime of `DndContext`, with a conditional compact task child.
- Capture a drag-start layout snapshot, update only local preview layout during `onDragOver`, restore the snapshot on cancel/outside drop, and persist once on a changed valid drop.
- Use a task-specific collision strategy: pointer intersection first, prefer nested task/container targets, fall back to a heading block only when the pointer is in its header region; use `closestCenter` when pointer coordinates are unavailable.
- Convert pointer position relative to the hovered task rectangle into explicit before/after placement; keep placement calculation in pure helpers so index adjustment and immutability are unit-testable.
- Do not use `useDroppable().isOver` styling for task destinations; render a placeholder/insertion marker instead.

## Product decisions captured in this task

- Use a compact floating overlay plus a live insertion placeholder.
- Do not highlight the destination group background.
- Heading target inserts first; trailing blank area appends last.
- Expanded tasks blur-save and collapse before dragging, and remain collapsed afterward.
