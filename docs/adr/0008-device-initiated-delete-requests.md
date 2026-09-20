# Device-initiated Delete Requests (ADR-0008)

> Supersedes one decision of [ADR-0007](./0007-local-first-engine.md):
> "Physical deletion is hub-side GC only". Hub-side GC, Compact Events and
> the no-tombstone stance stand unchanged.

## Context

The local-first V1 slice (ADR-0007) delivered the Engine and desktop Task
CRUD, but two operations still required the hub and therefore the network:

- **convert-to-project** must make the original Task disappear. REST does
  this by hard-deleting the task server-side, so the Engine implementation
  fell back to REST — offline convert was impossible, and a field-write-only
  decomposition would have left a corpse in Trash forever.
- **empty Trash** is a physical delete by definition; it could only be
  requested from the hub.

"Offline is full-functionality, not read-only mode" demands a delete
primitive a device can issue while disconnected.

## Decision

**Add a device→hub Delete Request to the sync protocol.** A Delete Request
carries an entity type and a batch of ids. The hub validates ownership
(subtasks claim through their parent task), physically deletes the rows,
cascades subtasks of deleted tasks (same convention as hub GC), and
broadcasts a **Compact Event** per the existing mechanism (per-user monotonic
seq). Devices enqueue Delete Requests in the Outbox alongside field writes;
a push applies field events first, then deletes — the order the Engine
emits them in.

**Compact permanently wins.** Once an id has been compacted, late field
changes for it — from a device push or a hub merge — are silently dropped.
The hub keeps a persistent registry of compacted ids per user
(`CompactedEntity`; ids only, no values, no clocks — not a tombstone in the
classical sense) so the rule survives hub restarts; replicas keep a
session-scoped in-memory set. Resurrection only happens by creating a new
entity with a new id, which needs no extra mechanism.

**No tombstones on the wire.** The Compact Event remains the only
non-field-level change type in the downstream direction; the Delete Request
is its device-initiated dual. Upstream there is nothing to replay after the
delete lands — repeats are idempotent no-ops on both sides.

**Replica-side cleanup mirrors hub referential semantics.** When a replica
removes compacted ids it also nulls out references to them (task/project
`areaId`, task `headingId`, tag `tagGroupId`), matching the hub's
`onDelete: SetNull`. This cleanup is local-only: it carries no clocks and
never enters the Outbox, so it cannot out-vote a concurrent legitimate
field write — LWW remains governed by real writes.

## Consequences

- `engine.delete(entity, ids)` is part of the Engine public API: rows leave
  the replica immediately (UI reacts at once), the request queues in the
  Outbox, and flush delivers it. `emptyTrash` and convert-to-project are
  thereby fully offline-capable.
- A device pushing a stale edit for a deleted entity converges to "deleted"
  instead of resurrecting the row — deletes beat concurrent edits without
  result flapping.
- Subtask creates whose parent task was compacted are dropped by the hub
  (the same rejection path as ownership checks) — no orphan subtasks.
- The hub rejects Delete Requests for ids the user does not own; deletion
  is not an authorization bypass.
- Web remains a thin client: no REST endpoint is retired by this ADR. Web
  deletion flows keep using REST; the collector tap converts their physical
  deletes into Compact Events exactly as before.
