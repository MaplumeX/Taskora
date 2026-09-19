# Task terminal state: single settledAt column + three-valued status

Taskora tasks had exactly two endings: Completed or deleted. Real life has a
third: **actively giving up** ("decided not to learn Japanese", "the proposal
was rejected"). Users were forced to either trash the task (losing the
decision history) or fake-complete it (polluting the logbook). We decided to
add a `CANCELLED` terminal state — kept, reversible, in the Logbook — and to
model settlement time with a single `settledAt` column.

Key decisions, in the order they matter:

- **`TaskStatus` gains `CANCELLED`** (Task and Subtask share the enum).
  Terminal-state semantics: `ACTIVE` (open), `COMPLETED` (finished), and
  `CANCELLED` (abandoned). Both endings are kept, reversible, and recorded
  in the Logbook; Trash stays orthogonal (a restored task returns to
  `ACTIVE` regardless of its prior terminal state).

- **One `settledAt` column, not `completedAt` + `cancelledAt`.** The status
  already says *how* the task was settled; the timestamp only needs to record
  *when*. Two nullable columns would force a "at most one non-null"
  invariant that every write path must maintain and every reader must trust;
  one column makes that invariant structural. The physical column replaces
  the old `completedAt` column via `RENAME COLUMN` (zero data migration:
  existing COMPLETED rows keep their completion time as their settle time).

- **The API field stays `completedAt`.** The DTO field name is not renamed
  (frontend compatibility first); its documented meaning becomes "settled at
  — when this task reached its terminal state". A small mapper
  (`settledToCompletedAt`) renames the key at the service/event boundary so
  HTTP responses and Change Event payloads keep their exact shape.

- **Terminal states rewrite each other directly.** `complete ↔ cancel` switch
  in one write and refresh `settledAt`; reopen (`uncomplete` / `uncancel`)
  returns to `ACTIVE` and clears `settledAt`. There is no mandatory
  "reopen first" intermediate step — Things behaves the same way, and the
  fake-complete-then-fix flow makes direct rewrites the common case.

- **Cancelling a parent Task does not touch its Subtasks** (same as complete)
  — the parent's ending and its steps' states are independent.

- **Whitelist-only status filters.** After this change, every status filter
  in the codebase must be either `status === ACTIVE` or `status in [...]`
  with an explicit enum list; `!= COMPLETED` / `not:` style blacklist filters
  are banned. "Includes completed" queries widen to
  `in: [ACTIVE, COMPLETED, CANCELLED]` (search, agent `list_tasks`,
  `includeCompleted`); the Logbook feed queries
  `in: [COMPLETED, CANCELLED]` sorted by settle time. The frontend
  `task-query-match` port mirrors the backend whitelists one-for-one so
  event-applied caches never drift from server-refreshed lists.

- **Project task counters count settled, not just completed** — a cancelled
  task no longer inflates a project's outstanding work. The `completed`
  count becomes "settled (completed + cancelled)", keeping the counter
  consistent with what the Logbook archives for that project.

- **Symmetric API surface and agent tooling.** `POST /tasks/:id/cancel`,
  `/uncancel`, `/subtasks/:id/cancel`, `/uncancel` mirror complete/uncomplete
  (same controller/service layering, same Change Event interceptor). The
  agent does not get new tools: `update_task` gains a `cancelled` parameter
  and `complete_subtask` is extended the same way; `includeCompleted`
  parameter names stay (schema compatibility) with descriptions updated to
  say "completed and cancelled". Cancelling is reversible and not
  destructive, so it never goes through the approval card.

- **Keyboard parity with complete.** macOS ⌥⌘K, Windows Ctrl+Alt+K, web
  Alt+Shift+K (pre-registered in `docs/keyboard-shortcuts.md`), dispatched
  through the existing keymap registry; Selection movement after cancelling
  behaves exactly like after completing. In the Logbook, ⌘K reopens either
  ending (uncomplete or uncancel) and the cancel key uncancels.

Consequences:

- Projects and Project Headings intentionally keep two-valued status and
  their own `completedAt` — cancelling a project is out of scope here.
- `convertToProject` maps a COMPLETED task to a COMPLETED project and copies
  its settle time; a CANCELLED task converts to an ACTIVE project (projects
  have no cancelled state) and drops the settle time.
- Subtask checkboxes remain complete/reopen only; cancelling a subtask goes
  through its context menu, so a stray click cannot cancel anything.
