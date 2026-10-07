---
status: accepted
---

# Single app-level DndContext

Sidebar Drop needs a task or project row to be dragged from the main content
onto the sidebar. Until now each list (`TaskList`, `ProjectTaskLayout`,
`GroupedFeedListView`, `Upcoming`, `AreaDetail`) and the sidebar
(`SidebarProjectSection`) owned a separate `@dnd-kit` `DndContext`, and a
droppable is only visible to draggables in the same context. We will mount one
`DndContext` in the app shell, shared by the sidebar and the content pane. Each
surface registers its drag handlers with it and receives only the events for
its own id prefix. The existing "Things-style yield" conventions in `lib/dnd.ts`
(DragOverlay, live preview, held order) stay the same.

## Considered Options

- **Native HTML5 drag between contexts.** Rejected. It would sit beside dnd-kit
  with a second drag model, its own ghost image and its own event quirks, and
  it would break the overlay/FLIP feel that every list now shares.
- **A portal drop layer over the sidebar inside each list's context.**
  Rejected. Every list would duplicate the sidebar targets, and the layer would
  have to reproduce the sidebar layout, including scrolling, collapsed areas
  and live project order.

## Consequences

- Sensors, collision detection and auto-scroll become shared. Lists that turn
  dragging off (for example filtered project views) must keep doing that
  through their own registration, because they can no longer swap the
  context's sensors.
- Collision detection has to rank sidebar targets above the content list
  whenever the pointer is over the sidebar. While the pointer is there, the
  source list puts its placeholder back in the original slot.

## Integration

- `AppDndProvider` (`packages/ui/src/lib/appDnd.tsx`) owns the only
  `DndContext`; `SidebarDropProvider` wraps it in `AppShell` and executes drops.
  A surface calls `useDndSurface({ owns, collisionDetection, sidebarPayload,
  onDragStart, … })`. `owns(id)` claims the surface's draggable and droppable
  ids, so events go only to the surface that owns the dragged item and its
  collision detection sees only its own droppables. Ids must therefore be
  unique among the surfaces mounted at the same time. The mobile Home page
  mounts its own nested `AppDndProvider` because the hidden desktop sidebar
  uses the same project/area ids.
- Collision: when the dragged item has a sidebar payload and the pointer is
  inside the sidebar, the provider hit-tests the sidebar drop targets with
  live rects and returns the accepting row, or the sidebar region id. A
  surface treats any `over` it does not own as "outside": it puts the
  placeholder back. A drop on the sidebar reaches the surface as
  `onDragCancel`.
- Only one `DragOverlay` may be mounted per context, because the context has a
  single overlay measurement ref. `useDndSurface` returns `overlayActive`,
  which is true for the surface that started the most recent drag, and a
  `dropAnimation` that is `null` after a drop on the sidebar. `TaskList` and
  the area page's project rows used to drag the row itself and now use an
  overlay as well, because the content pane clips the row.
- Sensors: mouse and touch for everyone. Keyboard dragging is opt-in through
  `useSortable({ data: keyboardDragData })` (project heading handles), so
  Enter/Space on other rows remain global keys. Filtered project views disable
  their sortables instead of swapping sensors. Auto-scroll uses the active
  surface's options, and switches to the sidebar's gentler options while the
  pointer is over the sidebar.
