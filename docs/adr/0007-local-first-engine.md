# Local-first Engine (tier-3 sync)

> **Note (2026-09-20)**: The "Physical deletion is hub-side GC only"
> decision below is superseded for device-initiated deletions by
> [ADR-0008](./0008-device-initiated-delete-requests.md) (Delete Requests,
> needed for offline convert-to-project and empty-trash). Hub-side GC and
> the no-tombstone stance stand unchanged.

Taskora's clients are thin: every read and write goes through the NestJS API,
so the app is useless offline and every interaction pays a network round trip.
We decided to move to a local-first architecture: a cross-client Engine
package (`packages/engine`) owns a per-device **Local Replica** (SQLite as the
unified data format — native on Tauri, WASM + OPFS on web), the UI reads and
writes the replica directly through reactive queries, and the server is
repositioned as a **Sync Hub** that merges per-field changes from all devices.

Key decisions, in the order they matter:

- **Motivation is offline editing + interaction latency + multi-device.** Data
  sovereignty (exportable files) is a side benefit of the SQLite choice, not a
  driver. This ordering rejects a pure cache/read-through approach.
- **Field-level LWW with HLC timestamps.** Every entity field carries its own
  Hybrid Logical Clock value plus a device id for tie-breaking; concurrent
  edits to the same field resolve to the newer HLC, loser's edit is silently
  dropped — **no conflict UI, ever**. This lossy semantics is accepted
  deliberately: task fields are small and independently editable, and the
  alternatives (document CRDT, OT) fight the relational data model.
- **Fractional-indexing strings for Position.** Ordering is a plain field of
  Task/Project/Tag entities inside the LWW system, not a separate CRDT list.
  Concurrent drags converge without touching other rows' positions; a
  background re-balance keeps strings from growing unboundedly.
- **Cross-field invariants are repaired after every hub merge** (amended
  2026-09-29). Field-level LWW can combine two valid edits into an invalid
  entity (a heading from another project, a Someday task with a reminder, a
  DATE task in the Anytime bucket). After merging and reference scrubbing,
  both hubs run the pure `repairEntity` (same rules as the REST services)
  and write its corrections with a winning virtual-device-0 clock, exactly
  like reference scrubbing, so every device converges on the repaired
  value. The tightening side wins (moving to another project clears the
  heading; leaving DATE clears reminder and repeat rule). Devices do not
  repair in storage — a local fix under the original clock could tie with a
  different hub value forever; they converge on the next pull. Field groups
  with a shared clock were considered and rejected: they turn independent
  concurrent edits (date on one device, reminder time on another) into
  conflicts. See `.scratch/local-first-v3/issues/01`.
- **Soft delete is the only delete on the sync wire.** The existing
  Trash/terminal-state model already encodes deletion as field updates, so it
  merges like any other field. Physical deletion is hub-side GC only, delivered
  to devices as **Compact Events** ("drop these ids"). No tombstones.
- **The hub stores per-field clocks as a JSON column** (`fieldClocks`) on the
  existing entity tables; the merger is a pure function over two clock maps.
  Existing NestJS CRUD modules demote to internals of the merger; the public
  surface becomes the sync endpoints (push batch / pull since cursor /
  bootstrap snapshot). New devices bootstrap from a full snapshot + seq, never
  by replaying history.
- **A pushed Outbox batch is acknowledged atomically at the protocol boundary.**
  The hub still attempts later events after an earlier event fails (a later
  event may create the dependency the earlier one needs), but any failure makes
  the HTTP request fail and the device retains and idempotently replays the
  whole batch. A partial-success response must never cause the device to drop
  unmerged writes.
- **Hub merges are serialized per user/entity/id.** Each read-merge-write runs
  in a database transaction guarded by a PostgreSQL advisory lock (and a row
  lock when the row exists). This preserves field-clock LWW under concurrent
  pushes, including concurrent creation of the same id across hub instances.
- **The pull log is persisted** (amended 2026-09-29; originally an in-memory
  ring buffer seeded with `Date.now()`, so every hub restart forced every
  device into a full bootstrap and multiple hub instances could not share a
  log). Change Events live in `SyncChange`, keyed by a per-user `seq`
  allocated from a `SyncCounter` row via `UPSERT … RETURNING` inside the
  writing transaction: the row lock is held until commit, so seq order equals
  commit order and a reader can never observe seq 11 before 10. Pull reads
  the counter and the log in one REPEATABLE READ snapshot and pages
  (`hasMore`). Entries are kept 30 days; the highest pruned seq is recorded
  as `prunedThrough`, and cursors below it — or above the current seq (a
  cursor from the old in-memory era) — get `resync`. Seq starts at 1 with no
  change behind it, so a never-bootstrapped cursor 0 always resyncs. REST
  writes still reach the log through the post-commit collector tap, in their
  own small transaction: a crash between the REST commit and that append can
  drop one Change Event (the row itself is safe and reappears on the next
  bootstrap).
- **Bootstrap uses a cursor fence.** The hub captures the current cursor before
  reading the snapshot. Writes racing with the snapshot therefore either
  appear in it or carry a later sequence and are replayed by the next pull;
  bootstrap must not pair an old snapshot with a cursor captured afterwards.
- **The server is just device zero.** Assistant (pi-agent-core) writes go
  through the same merge path with their own virtual device id and HLC — no
  privileged writes, no server-clock comparisons against device HLCs. The
  Destructive Operation approval-card flow is unchanged: approval simply
  releases the resulting Change Events.
- **Device clocks are calibrated to hub time** (amended 2026-09-29). In
  practice the hub does stamp virtual-device-0 clocks from its own wall clock
  (REST/web writes, reference scrubbing), so device HLCs are compared against
  server time after all. To make that comparison fair, every sync response
  carries `serverTime`; the Engine derives an NTP-style offset (round trips
  over 5 s are ignored), persists it, and adds it to the HLC wall reading.
  Remote stamps can advance a local clock by at most one hour beyond the
  calibrated now (`MAX_CLOCK_DRIFT_MS`), so one device with a clock set into
  the future cannot drag every other device along. The hub never rejects
  future stamps — that would turn a bad clock into a permanently failing
  push. Stamps already written with a future wall time keep winning LWW until
  real time catches up; they are not rewritten retroactively.
- **Migration is a vertical slice, desktop first**: Task CRUD in
  Inbox/Today buckets moves to the Engine first; the rest of `packages/api` and
  the old HTTP CRUD surface retire slice by slice. Web follows desktop once
  OPFS support is validated; the old SSE push stream (ADR-0005) is superseded
  by the bidirectional sync channel along the way.

## Considered Options

- **Document CRDT (Automerge/Yjs) per user**: rejected — relational
  Area/Project/Task/Tag queries inside a single opaque document are painful,
  and the Prisma/Postgres server replica would need a parallel query model.
- **Op-log with server ordering**: rejected — the most complex option, and the
  server ordering step reintroduces a write bottleneck we are trying to remove.
- **Guest/local-only mode with later account merge**: deferred — merging an
  anonymous local dataset into an account is a whole second protocol (entity
  re-parenting, generalized conflicts) and an endless scope for v1. Login-only
  devices; JWT multi-user auth unchanged, one persistent device id per login.

## Consequences

- Prisma schema stays the source for the hub's Postgres replica, but the
  Engine owns its own SQL schema/migrations; the two are aligned by contract
  tests, not codegen. Drift is possible and must be tested.
- Simultaneous edits to the same field on two offline devices lose one side by
  HLC + device-id tie-break. Users were told this is acceptable; do not add a
  merge dialog later without revisiting this ADR.
- The Local Replica is disposable (rebuildable from a snapshot), but it is not
  a cache: while offline it is the only copy of unsynced edits in the Outbox.
  Device storage loss before a flush loses those edits.
- Web is second-class until OPFS is validated: expect a period where desktop
  is local-first and web is still thin-client against the same hub.
