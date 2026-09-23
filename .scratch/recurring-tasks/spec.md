# Feature: Repeating Tasks (重复任务)

Status: ready-for-agent

## Problem Statement

Taskora 用户的很多任务是周期性的——「每周一浇花」「每月 15 号交房租」「每 2 周给客户发报告」。现在每一轮都得手动重建同一个任务：重新输入标题、重新挂子任务和标签、重新设提醒。重复劳动本身就该被自动化掉，这正是任务管理器的职责。同时，Taskora 是 local-first 多端同步的：用户会在离线的地铁里、在两台同时离线的设备上完成任务，重复任务的「下一次」必须在任何拓扑下都恰好出现一次。

## Solution

采用 Things 3 式的 **Task 字段模型**：Task 上新增 `repeatRule` 结构化字段（单位 day/week/month/year × 间隔 N × 周模式的星期几集合，可选锚点开关「从完成日期算」）。设了规则的 Task 被完成时，**完成的设备在本地立刻派生出下一个实例**——一个携带相同规则的普通 Task：未来的日期落在 Upcoming，逾期则落在 Today。多设备并发完成通过**确定性 ID 派生**天然去重（ADR-0012）：同一逻辑实例无论由哪台设备派生，ID 相同，字段级 LWW 照常收敛。Sync Hub 零业务逻辑改动。规则编辑只影响当前实例及其后代，链自然分叉；取消任务、移入 Someday 或到达 `until` 日期时链终结。UI 上，ScheduledDateField Popover 式的编辑入口提供「每 N 单位」步进器、周模式星期按钮与「下次：X 月 X 日」实时预览；Task 行显示 ↻ 图标。

## User Stories

1. As a Taskora user, I want to attach a repeat rule to a scheduled Task, so that I don't have to recreate it every cycle.
2. As a Taskora user, I want rules like "every day", "every 2 weeks on Wednesdays and Fridays", "every month", and "every year", so that my common cycles are covered.
3. As a Taskora user, I want the next occurrence to appear immediately when I complete a repeating Task, so that the continuation is visible without any manual step.
4. As a Taskora user, I want a future occurrence to land in Upcoming, so that I can see it coming.
5. As a Taskora user who completed a repeating Task late, I want the overdue next occurrence to land in Today, so that I can catch up on it.
6. As a Taskora user, I want the next occurrence computed from the scheduled date by default, so that fixed-rhythm tasks (rent, meetings) don't drift.
7. As a Taskora user, I want an "after completion" anchor option, so that gap-based tasks (change sheets, backups) recur from when I actually finished.
8. As a Taskora user, I want the next instance to copy the task's subtasks (reset to unchecked), tags, reminder time, notes, and project/area placement, so that the next round starts fully equipped.
9. As a Taskora user, I want a ↻ icon on task rows that carry a repeat rule, so that I can see at a glance which tasks will continue.
10. As a Taskora user editing the repeat rule on an instance, I want the change to affect only that instance and its descendants, so that "watering every 2 weeks → every 3 weeks from now" is expressed naturally.
11. As a Taskora user, I want cancelling a repeating Task to end the chain, so that stopping a habit is one deliberate action.
12. As a Taskora user, I want moving a repeating Task to Someday to clear its rule, so that a shelved task can't silently spawn occurrences.
13. As a Taskora user, I want the rule cleared when the scheduled date is removed (ScheduledType → NONE), so that a rule never floats without an anchor date.
14. As a Taskora user, I can optionally set an `until` date on a rule, so that a chain ends on its own when a commitment expires.
15. As a Taskora user, I want a live "next: Feb 9, Monday" preview in the rule editor, so that I can verify a complex rule before saving.
16. As a Taskora user, I want un-completing a repeating Task to also delete the derived instance, so that an accidental completion leaves no trace behind.
17. As a multi-device user, I want two offline devices that both complete the same repeating Task to converge on exactly one next instance, so that concurrency never doubles my chores.
18. As a multi-device user, I want the derived instance to sync like any other Task via field-level LWW, so that I can edit its title on one device and see the edit everywhere.
19. As an offline user, I want the next occurrence derived locally the moment I complete the task, so that repetition works in the subway with no network.
20. As a Taskora user, I want the rule preserved on the settled task in the Logbook, so that history records that the task used to repeat.
21. As a Taskora user restoring a previously-settled repeating Task from the Logbook, I want completing it again to reuse the derivation idempotently (skip if the descendant already exists), so that restore never duplicates.
22. As a Taskora user, I want the rule editor available wherever the scheduling UI is (date popover), so that setting "when" and "how often" live in one place.
23. As a Taskora user with a Someday or dateless task, I do not see the repeat rule option, so that the UI never offers a rule that cannot anchor.

## Implementation Decisions

### Domain model

- New Task field `repeatRule` — a structured object, **not** a string: `{ unit: 'day'|'week'|'month'|'year', interval: number, weekdays?: number[] (unit=week), anchor: 'scheduled'|'completion', until?: date }`. The shape is chosen to be upgradable to full RRULE (BYSETPOS etc.) without data migration.
- Terms **Repeat Rule / Repeat Instance / Repeat Chain** are defined in CONTEXT.md. There is **no template entity**: a Repeat Instance is a plain Task; the chain lives entirely in the `repeatRule` field being copied forward.
- Repeat Rule requires ScheduledType = DATE (same precondition as Reminder). Moving to Someday or NONE clears the rule automatically, mirroring the Reminder clearing semantics.
- Settled (Completed/Cancelled) tasks keep their `repeatRule` for Logbook provenance; settlement itself only triggers derivation on completion, never on cancellation.
- Rule storage must be **canonical** (normalized at write time): the derivation hash (below) requires stable inputs.

### Derivation (the core mechanism, ADR-0012)

- **Client-side derivation**: the device that completes the task derives the next instance locally and writes it to its Local Replica; it flows through the Outbox like any write. Offline-first by construction.
- **Deterministic ids**: `instanceId = hash(parentTaskId, canonicalRule, occurrenceDate)`; subtasks derive ids as `hash(parentInstanceId, subtask path)`. Concurrent completions on multiple devices converge onto the same entity; field-level LWW then resolves per-field differences. Derived ids plug in at the `LocalReplica` `generateId` seam; everything downstream (sync, merge, storage) is id-shape-agnostic.
- **Idempotent derivation**: if a descendant with the target id already exists (restore-then-recomplete path), derivation skips silently.
- **Occurrence date computation**: anchor `scheduled` → advance from scheduledDate by the rule (weekdays filter for week unit); anchor `completion` → advance from the settle date. Overdue results keep their computed date (which lands them in Today); results past `until` (or none left) terminate the chain — no instance is derived.
- **Copy set on derivation**: title, notes, tags, reminderTime, projectId/areaId/headingId placement, repeatRule — and subtasks as **new derived entities reset to ACTIVE**. Position: the derived instance enters at the end of the target list (new position, no inheritance).
- **Un-settle cancels derivation**: reopening (uncomplete) a repeating task deletes its derived instance — derivation is part of the settlement side effect (extends ADR-0006 reopen semantics). Deleting an already-user-edited derived instance is accepted behavior for v1; refined handling is P2.

### Sync

- Completion and derivation are **two separate Change Events** (field update on the parent; entity creation for the instance). No new event types; the existing field-level LWW + HLC machinery handles everything.
- Sync Hub requires **zero changes** — no business logic, no dedup keys (ADR-0007 boundary preserved). Deduplication is a pure consequence of deterministic ids.
- Rule edits are ordinary field edits under LWW; chain forking is the accepted (and desired) semantics — no propagation to ancestors or already-derived descendants.

### UI

- Rule editor lives in the scheduling popover (alongside the Reminder section), following its established pattern: visible/enabled only for ScheduledType DATE, disabled for Projects.
- Editor controls: unit selector (day/week/month/year), "every N" stepper, weekday toggle buttons for week mode, "after completion" anchor toggle, optional until-date field. Live next-occurrence preview line ("下次：2 月 9 日 周一") computed by the pure rule→date function.
- Task rows show a ↻ badge when `repeatRule` is set (pattern: Reminder's clock badge). No chain navigation, no "view series" affordances.
- Copy uses「重复」(never 循环/周期); next occurrence references Scheduled Date semantics.

### Terminal-state interactions

- Cancel (as opposed to complete) does **not** derive; the chain simply ends. Un-cancel restores the task with its rule intact.
- The rule survives on settled tasks in the Logbook (read-only provenance).
- Trash is orthogonal: trashing a repeating task neither derives nor strips the rule.

## Testing Decisions

- **Good tests assert external behavior**: given a task with a rule and a completion action, the observable outcomes are (a) the parent settles, (b) a task with the derived id and expected fields/date exists, (c) idempotency/dedup behavior. No assertion on hash internals beyond stability.
- The rule→occurrence-date function is a **pure function** and gets exhaustive unit tests (the highest-value seam): unit × interval × weekdays × anchor × until, month/year end-of-month, overdue catch-up, chain termination.
- Derivation has two seams worth testing: the **engine-level** test (complete a task in a Local Replica → instance exists; un-complete → instance gone) and the **merge-level** test (two replicas each complete the same task offline → sync → exactly one instance, fields converge) following the prior art of `merger.test.ts` / `hlc.test.ts` in `packages/engine`.
- UI-level: rule editor visibility gating (DATE vs Someday/NONE, Task vs Project) and the ↻ badge, tested like the Reminder section's equivalents.

## Out of Scope

- Full RRULE support (BYSETPOS "last Friday of the month", COUNT): the storage shape is upgrade-friendly, the semantics are not built.
- Chain navigation / "view series" UI (Things doesn't have it either).
- Editing the rule of already-derived descendants in bulk.
- Repeating Reminders as a separate concept (Reminder rides along as a copied field).
- Preserving user edits on a derived instance when its parent's completion is undone (P2 refinement).
- Server-side derivation or hub-side dedup (explicitly rejected in ADR-0012).
- Repeating Projects / Areas.

## Further Notes

- ADR-0012 (`docs/adr/0012-deterministic-repeat-instance-ids.md`) records the deterministic-id decision and its rejected alternatives (hub-side business-key dedup, accept-duplicates, template projection).
- CONTEXT.md now defines Repeat Rule / Repeat Instance / Repeat Chain.
- The Reminders spec (`.scratch/reminders/`) listed "repeating reminders" as a non-goal; that non-goal is superseded in spirit by this feature in the narrow sense that reminderTime is copied onto derived instances — standalone reminder repetition (snooze etc.) remains out of scope there.
- Rule normalization at write time is load-bearing (derivation hash stability); treat the normalizer as part of the public rule API.

## Comments

### 2026-09-23 — Implementation (feat/recurring-tasks)

Implemented on `feat/recurring-tasks`. Layered as follows:

- **Pure core** (`packages/engine/src/repeat.ts`): `normalizeRepeatRule`
  (canonical form: interval clamped 1–999, weekdays only on week rules,
  sorted/deduped, until normalized to a date key), `nextOccurrenceDate`
  (UTC-day arithmetic for device-independent determinism; month/year
  end-of-month clamping; ISO-Monday week alignment for weekday patterns,
  deliberately independent of the UI week-start preference),
  `deriveRepeatInstanceId` / `deriveSubtaskId` (four-seed FNV-1a → 32-hex
  id over `parentTaskId + canonicalRule + occurrenceDate`). All date math
  runs in UTC days so two devices in different timezones deriving
  concurrently compute the same occurrence date — otherwise the
  deterministic-id dedup would silently break.
- **Device-side derivation** (`packages/api` engine task backend):
  `completeTask` derives the next instance locally (offline-first) with
  the full copy set and subtasks reset to ACTIVE at derived ids;
  idempotent skip when the target id already exists. `uncompleteTask` /
  `uncancelTask` recompute the instance id and delete it (re-open cancels
  the settlement side effect). Rule clearing off DATE mirrors the
  Reminder semantics; settling *keeps* the rule for Logbook provenance.
- **Server-side derivation** (REST `TasksService.complete`): web clients
  cannot derive locally, so the REST complete path derives on the server
  using the *same* engine pure functions — device-derived and
  server-derived instances share ids and converge through LWW. Un-complete
  deletes via Compact registration (same transaction pattern as
  convert-to-project). Storage: `repeatRule TEXT` (canonical JSON) on the
  Task table; the sync codec converts wire object ↔ JSON text.
- **UI**: rule editor in the scheduling popover (`showRepeatRule` gate —
  Task context only, DATE only; Projects never), stepper + unit select +
  weekday toggles + anchor toggle + until date + live next-occurrence
  preview; ↻ badge on task rows. Works on web too (data-only feature,
  unlike reminders which needed client notification capabilities).

Deviations from the letter of the spec (reconciled after two-axis review):

- **Server-side derivation for web** is listed under Out of Scope
  ("Server-side derivation or hub-side dedup"), but web clients have no
  local replica to derive from — dropping it would strand them. Implemented
  as REST-app-side derivation in `TasksService.complete` using the same
  engine pure functions; the *sync hub* (SyncHubService) still has zero
  repeat-awareness (ADR-0007 boundary intact — ADR-0012 gained a "who
  derives" scope note). This supersedes that Out-of-Scope line.
- **Id seam**: the spec says derived ids "plug in at the LocalReplica
  generateId seam"; the implementation passes the explicit id through
  `engine.create` (which honors `values.id`, the same mechanism the replica
  uses). Same effect, different documented seam.
- **`uncancelTask` also deletes the derived instance** (beyond "un-cancel
  restores the task with its rule intact"): covers the complete→cancel→
  reopen path where the earlier completion derived. For anchor=scheduled
  the recomputed id matches and cleanup works; for anchor=completion the
  cancel timestamp yields a different occurrence and the deletion no-ops
  (instance survives — accepted v1 edge).

Deviations / accepted edges (all consistent with the spec's v1
carve-outs):

- Deleting an already-user-edited (or already-completed) derived instance
  on un-complete is accepted v1 behavior; the same applies to the narrow
  uncomplete→re-complete race inside an unflushed outbox window.
- **Un-complete → re-complete re-derivation**: the deterministic id was
  compacted by the un-complete's delete request, and ADR-0008 forbids
  same-id resurrection — so re-derivation falls back to a freshly
  generated id (verified by an engine sync-level test). Residual trade-off:
  a *subsequent* un-complete can no longer find that fresh-id instance via
  the deterministic link, so it survives (user-deletable); and the
  app-restart-with-unflushed-outbox window can still lose the instance
  (compacted set is session-scoped). Full link tracking (e.g. a
  derived-from field) is P2 territory.
- REST `complete` skips derivation when the task is already COMPLETED
  (double-click/retry guard): with anchor=completion, refreshing
  settledAt would otherwise compute a different occurrence and derive a
  second instance.
- `uncancelTask` also attempts the derived-instance deletion
  (anchor=scheduled recomputes the same id, so complete→cancel→reopen
  cleans up; anchor=completion computes a different id from the cancel
  timestamp and no-ops — the instance survives that path in v1).
