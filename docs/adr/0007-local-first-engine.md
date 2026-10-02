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
  every synced entity inside the LWW system, not a separate CRDT list.
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
  unmerged writes. The one partial response is `rejected` (protocol 1, see
  below): changes the hub cannot understand at all are listed, the device
  keeps exactly those in the Outbox and acknowledges the rest.
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
  writes append to the log inside their own transaction too (see below);
  the earlier post-commit collector tap and its crash window are gone.
- **Bootstrap uses a cursor fence.** The hub captures the current cursor before
  reading the snapshot. Writes racing with the snapshot therefore either
  appear in it or carry a later sequence and are replayed by the next pull;
  bootstrap must not pair an old snapshot with a cursor captured afterwards.
- **The server is just device zero.** Assistant (pi-agent-core) writes go
  through the same merge path with their own virtual device id and HLC — no
  privileged writes, no server-clock comparisons against device HLCs. The
  Destructive Operation approval-card flow is unchanged: approval simply
  releases the resulting Change Events.
- **REST writes go through the merger** (amended 2026-09-29). The REST
  services (web and Assistant) no longer write Prisma directly: they read,
  apply the shared domain rules, and submit field writes and physical deletes
  through `SyncHubService.writeAsHub`. One REST call is one Postgres
  transaction: every row is locked, merged, scrubbed and repaired exactly like
  a device push, and the Change Events are appended to the log before commit.
  The hub stamps each write as virtual device 0 with an HLC above every clock
  already on the row (the caller saw those values, so the write is causally
  later — this also beats a device clock set into the future); fields whose
  value is unchanged are not written. Physical deletes share the Delete
  Request path (ownership, `DELETE_CASCADES`, compact registration).
  Consequences: stored `fieldClocks` are authoritative, so the per-field
  value digests that inferred "REST changed this field behind the merger's
  back" are gone from serialization, and so is the collector tap's sync
  branch (the collector still feeds the legacy SSE stream). On startup the
  hub materializes the clocks the digests implied for rows that still carry
  them (`legacy-clock-backfill`) and clears `fieldDigests`; merge writes clear
  it too. During a rolling deploy an old instance can still write
  digest-only changes after the backfill; those rows keep their previous
  clocks until the next write. The column is dropped once no old hub runs.
  See `.scratch/local-first-v3/issues/05` step 1.
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
- **Replica schema and sync protocol are versioned** (amended 2026-09-29).
  The Local Replica records its schema version in SQLite `user_version`;
  migrations are an append-only list, one transaction per step with the
  version bump inside it. A new replica is created at the latest version; a
  replica newer than the code (a downgrade install) is refused
  (`ReplicaSchemaTooNewError`) — the app falls back to online REST and asks
  for an update rather than writing a schema it does not understand.
  The sync protocol has an integer version (`SYNC_PROTOCOL_VERSION`), sent as
  the `x-taskora-sync-protocol` header with a client id in `x-taskora-client`
  — headers, because the hub's DTO validation rejects unknown body fields and
  pull/bootstrap have no body. Every sync response carries `protocolVersion`
  and `minProtocolVersion`. Upgrade rules:
  - A request below the hub's minimum gets **HTTP 426**; the device stops
    syncing, keeps its Outbox and shows an update prompt. Missing header
    means protocol 0 (clients from before versioning).
  - A client newer than the hub is served by capability: unknown entity types
    (writes and Delete Requests) and unknown fields are listed in
    `PushResponse.rejected`; known fields are merged. The device keeps
    rejected changes in the Outbox and re-pushes them on later syncs, so they
    land once the hub is upgraded. Nothing is silently dropped on the push
    side.
  - Devices skip entity types they do not know in pull and bootstrap. A hub
    that adds an entity older clients must understand (because they would
    otherwise corrupt data, not merely not display it) raises
    `minProtocolVersion` instead.
  - Bump `SYNC_PROTOCOL_VERSION` when the wire format or its meaning changes
    incompatibly; new request body fields are only sent once the hub's
    reported `protocolVersion` says it understands them. Raise the hub's
    minimum only when old clients would do harm, never just to force updates.
  See `.scratch/local-first-v3/issues/03`.
- **The replica is bounded; bootstrap is paged** (amended 2026-09-30).
  The Local Replica no longer mirrors every settled task: tasks settled
  before a cutoff (default 365 days, `archiveAfterDays`), not in Trash and
  not in an active project are *archived* — left out of the snapshot,
  pruned locally by `Engine.maintain` (local delete only: no Outbox entry, no
  compact registration), and read page by page from the hub when the Logbook
  is scrolled to the end (read-only). The rule lives once in
  `engine/src/archive.ts`. An archived task changed on the hub comes back
  through the log; the device then fetches its Subtasks (`POST
  /sync/entities`). Protocol 2 pages `GET /sync/bootstrap` (stateless
  base64url token carrying the cursor fence and cutoff; older clients still
  get one response). A new device merges pages straight into the replica so
  the first page renders; an existing replica stages pages and swaps them in
  one transaction. Compact registrations now expire: the hub deletes each
  one together with its Compact Event when the log is pruned (any device
  that has not pulled it is past `prunedThrough` and bootstraps first); the
  device keeps its own for two days longer. With registrations gone, the hub
  treats a device's partial write to a missing row as a delete (answers with
  a Compact Event instead of building a partial row or failing the push
  forever) and scrubs references to missing entities that are not in the
  same push. A device drops Outbox writes for entities it learns were
  compacted. See `.scratch/local-first-v3/issues/08`.
- **Position is the only ordering key** (amended 2026-10-02). Every synced
  entity (Task, Subtask, Project, Project Heading, Area, Tag, Tag Group) now
  carries a Position; the integer `sortOrder` left the wire in protocol 4.
  Legacy rows were materialized once on hub startup with the key the hub used
  to synthesize on the fly (`sortOrder` + `createdAt`), and the Local Replica
  did the same in its 7 → 8 migration, so no device saw a change. Reorders on
  both sides assign new keys only to the rows that must move
  (`planReorder`). The hub's minimum protocol is 4: protocol-3 clients still
  order four entity types by `sortOrder` and would write reorders the hub no
  longer accepts, losing them silently. The column was dropped in a later
  release (the Prisma migration refuses to run while any Position is still
  null; the replica drops it in its 8 → 9 migration). See
  `.scratch/retire-sort-order`.
- **Migration is a vertical slice, desktop first**: Task CRUD in
  Inbox/Today buckets moves to the Engine first; the rest of `packages/api` and
  the old HTTP CRUD surface retire slice by slice. Web follows desktop once
  OPFS support is validated; the old SSE push stream (ADR-0005) is superseded
  by the bidirectional sync channel along the way.
- **Web runs the Engine** (amended 2026-09-29). The Local Replica on web is
  SQLite WASM (`@sqlite.org/sqlite-wasm`) on the OPFS SyncAccessHandle Pool
  VFS inside a dedicated worker — no COOP/COEP headers needed, one pool
  directory and database per account. The pool can only be opened by one
  tab at a time, and the Outbox and HLC must exist once, so a Web Locks
  leader tab owns the replica, the single Engine and the sync loop; every
  tab's UI talks to a `TabEngine` that runs calls locally in the leader and
  forwards them over `BroadcastChannel` otherwise. The leader broadcasts
  change notifications and sync status. When the leader tab closes, the next
  queued tab takes the lock and announces itself; unanswered calls are resent
  (writes are idempotent: creates carry a caller-chosen id). This is why
  `Engine.isCompacted` became async. While the Engine is active, React Query
  runs with `networkMode: 'always'` — reads and writes are local, and the
  default mode pauses queries whenever the browser reports offline. Browsers
  without OPFS / Web Locks, or a replica that cannot be opened (including
  one written by a newer version), keep the REST path, which since the change
  above goes through the merger as well. Offline cold start (reloading the
  page with no network) needs a service worker for the app shell and a
  locally cached identity; that is not part of this step. See
  `.scratch/local-first-v3/issues/05` step 2.

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
- Web was second-class until OPFS was validated. Since 2026-09-29 web is
  local-first too where the browser supports it; the REST path remains as the
  fallback and for the Assistant, both writing through the merger.
