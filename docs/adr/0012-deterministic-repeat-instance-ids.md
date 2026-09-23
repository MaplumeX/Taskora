# Repeating tasks: deterministic id derivation for repeat instances

Repeating tasks are modeled the Things way: a `repeatRule` **field** on Task, no
template entity. When a device completes a Task carrying a rule, that device
locally derives the next occurrence and writes it to its Local Replica — it
flows to the Sync Hub through the Outbox like any other write.

This creates a problem field-level LWW cannot solve alone: two devices can both
be **offline**, both complete the same repeating Task, and both derive a "next"
instance. Those are two entity creations with, in the default scheme, two
random ids (`crypto.randomUUID()`). LWW resolves per-field conflicts on the
*same* entity id; it cannot merge two distinct ids that represent the same
logical occurrence. The result would be a doubled task, silently, with no
conflict UI to catch it — and repeating tasks are exactly the high-frequency
path where this would bite.

## Decision

The id of a repeat instance is **derived, not random**:

```
instanceId = hash(parentTaskId, rule, occurrenceDate)
subtaskId  = hash(parentInstanceId, subtaskOrdinals)
```

Both devices running the same completion derive the same id for the same
logical occurrence. The two "creations" converge onto one entity, and ordinary
field-level LWW resolves whatever field-level differences exist between the
two derived copies (title edits, positions). **No hub-side business logic is
added** — the hub still only merges; it never learns what a repeat rule is.
This preserves the ADR-0007 boundary (hub is a dumb merger) and keeps
derivation fully available offline.

Subtask ids must be derived the same way (hash of the derived parent id plus
the subtask's path within the parent), otherwise two concurrently-deriving
devices produce two divergent subtask sets under the same converged parent.

## Alternatives rejected

- **Hub-side dedup on a business key** `(parentTaskId, nextDate)`: requires the
  hub to understand repeating-task semantics, breaking the "hub merges, never
  judges" boundary; also fails while the winning device is still offline.
- **Accept occasional duplicates**: repeating tasks are high-traffic; manual
  cleanup is not acceptable for the feature's core promise.
- **Template entity with authoritative projection** (Todoist/RTM style):
  requires *some* authority deciding when instances materialize, which
  contradicts the no-authority local-first model and roughly doubles the
  feature's surface area.

## Scope note: who derives

The deterministic-id scheme requires only that *whoever* derives uses the
same pure functions. Three derivation sites exist, and none of them is the
sync hub's merge path:

- **Devices** (desktop/mobile engine backends) derive locally on complete —
  the primary, offline-first path.
- **The REST app** (`TasksService.complete`) derives server-side on behalf
  of web clients, which have no local replica. This is the NestJS REST
  layer, not the sync hub: SyncHubService still never parses a rule, keeps
  no dedup keys, and merges opaquely (ADR-0007 boundary intact). A
  server-derived instance and a device-derived instance of the same
  completion share the same id and converge through ordinary LWW.
- **Un-complete** deletes the derived instance on the same site that
  derived it (device → Delete Request; REST → Compact registration in the
  physical-delete transaction).

When a deterministic id has already been compacted (complete → un-complete →
re-complete on one device), the re-derivation falls back to a freshly
generated id: ADR-0008 permits resurrection only with a new id, and
sequential re-derivation does not need cross-device dedup — only concurrent
derivations do.

## Consequences

- Id generation for repeat instances leaves the `generateId` seam
  (`LocalReplica` options); derived ids look like any other id to the rest of
  the system, so sync, merge, and storage are untouched.
- **Idempotent re-derivation.** Restoring a previously-settled repeating Task
  from the Logbook and completing it again must not crash on id collision:
  derivation checks for an existing descendant with the target id and treats
  "already derived" as success (skip). The restore path never deletes
  descendants by itself.
- The hash inputs must be stable and canonical: `parentTaskId` (the settled
  task's id), the rule in a canonical serialized form, and the occurrence
  date. A rule stored in a non-canonical shape would fork the chain, so rule
  normalization happens at write time.
- Un-complete (= un-settle) of a repeating Task **cancels the derivation side
  effect**: the derived instance is deleted. This matches the existing
  "reopen clears the terminal state" semantics from ADR-0006 — the derivation
  is part of the settlement.
- Rule edits fork the chain *by design*: each instance carries its own copy of
  the rule, and LWW applies to the rule field like any other. There is no
  back-propagation to ancestors or forward propagation to already-derived
  descendants.
