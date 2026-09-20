# Local-first Engine (tier-3 sync)

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
- **The server is just device zero.** Assistant (pi-agent-core) writes go
  through the same merge path with their own virtual device id and HLC — no
  privileged writes, no server-clock comparisons against device HLCs. The
  Destructive Operation approval-card flow is unchanged: approval simply
  releases the resulting Change Events.
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
