---
status: accepted
---

# Undo recorded at the Engine write boundary

Things 3 lets you undo almost any edit (shake on iPhone, ⌘Z on Mac). We will
record Undo at the Engine's write methods (`create` / `update` / `updateMany` /
`delete`) instead of in each UI action. `UndoHistory.attach(engine)` (api
package) returns a wrapped Engine, and the platform shell hands that wrapper to
the domain backends. Each write stores its inverse: the old values of the
patched fields, a Delete Request for a created entity, or a re-create for a
deleted Subtask. Undo writes those inverses back as ordinary local writes, so
they sync like any other edit (ADR-0007). A field is only written back while it
still holds the value the step wrote, so later edits from this device or from
other devices win.

An **Undo Step** is every write started between two user inputs (pointerdown,
click or keydown, caught in the capture phase). That groups an action's
internal writes into one step without changing any call site: completing a
repeating task together with its derived instance, a multi-select batch, a
group drag.

## Considered Options

- **Explicit `undoable(label, fn)` around each UI action.** Rejected. There are
  dozens of mutation call sites across lists, toolbars, menus, keyboard
  shortcuts and field cards. Any site we missed would silently not be undoable,
  and each one would need its own inverse logic.
- **Inverse operations per backend method** (`completeTask` → `uncompleteTask`).
  Rejected. The domain inverses are not exact: reopening a repeating task keeps
  its derived instance (CONTEXT: Repeat Instance), and moving to the Inbox
  clears the schedule for good. Undo has to restore the previous state, not run
  the opposite action.
- **Grouping by a quiet-time window.** Rejected. A blur commit followed by a
  tap less than ~100 ms later would merge two user actions. Input events mark
  the boundary between user actions directly.

## Consequences

- Physical deletes other than Subtasks (empty Trash, delete area, tag, heading
  or attachment, convert to project) cannot be inverted: the id is compacted
  (ADR-0008), and the replica scrubs references internally. Such a step clears
  the history, so older steps never target entities that no longer exist.
- Undoing a creation sends a Delete Request, which compacts that id. A repeat
  instance derived again later takes the existing `compacted` path and gets a
  fresh id (ADR-0012).
- Writes are serialized through the wrapper so that each "before" read sees the
  previous write. This is cheap for local writes, but large batches pay one
  extra read per row.
- Writes that bypass the wrapper, such as the reminder coordinator (notification
  actions) and sync merges, never become undo steps. A new non-UI writer must
  use the raw Engine for the same reason.
- History lives in memory only and has no Redo. Today only the Android shell
  attaches it (shake to undo). Desktop and web can attach the same wrapper
  later for ⌘Z.
