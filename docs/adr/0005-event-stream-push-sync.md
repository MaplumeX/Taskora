# Event Stream for data-change push (tier-1 sync)

> **Status: superseded by [ADR-0007](0007-local-first-engine.md) (in slices).**
> The Event Stream evolves from a server-to-client push channel into the
> bidirectional transport layer of the local-first sync protocol: same
> per-user monotonic seq (now the Sync Cursor), same Change Event unit (now
> field-level with HLC metadata). Everything below describes the tier-1 design
> as built and remains accurate for slices not yet migrated.

The client has no push channel for domain data, so the desktop app relies on
`refetchOnWindowFocus` to catch up after returning to the foreground, which
causes a visible flash. We decided to add a per-user, always-on SSE event
stream that pushes Change Events (full entity payloads; deletes carry only the
id) so clients can update their React Query caches in memory without
refetching, and to turn `refetchOnWindowFocus` off entirely.

Key decisions, in the order they matter:

- Events carry **full entities** (list-DTO shape, e.g. Task + embedded tags);
  deletes carry only the id. Subtasks and Tags are entities of their own, so
  they emit their own events rather than being nested.
- One **global per-user stream** (`/events`), separate from the agent
  conversation SSE. The frontend mounts it once per session in the app layer
  (login connects, logout disconnects). Quick Add window gets its own
  connection.
- Events are produced by a **Prisma `$extends` interceptor** on
  create/update/delete — not per-service emits — so every write path is
  covered, including Assistant-initiated edits. Relation-table writes
  (e.g. TaskTag rows) are mapped to the parent entity's `updated` event.
- Actions are **dumb**: `created` / `updated` / `deleted`. Trash, restore,
  complete, bucket moves are all `updated` — view semantics stay in the
  entity fields where the client already filters on them. Hard delete (empty
  trash, cascades) emits `deleted`.
- Multi-row transactions are **collected and flushed after commit**, deduped
  per entity to the final action, so bulk operations don't spam the client.
- A **per-user monotonic sequence number** guards against missed events:
  in-memory ring buffer (~500 events), seeded from `Date.now()` on boot so a
  server restart produces a detectable gap. On gap detection the client does
  one full refetch — this is the only correctness backstop, since
  focus-refetch is disabled.
- Client applies events via **`setQueryData` upserts (with a ~50ms coalescing
  window)**, falling back to `invalidateQueries` only when a cache can't be
  located surgically.
- Coverage: tasks, subtasks, projects, project-headings, areas, tags,
  tag-groups. No events for `feed` (derived view of tasks) or `users`.

## Considered Options

- Tier-2 (cursor-based incremental sync) and tier-3 (local-first sync engine,
  Things-style) were considered and deferred: the app has no offline editing
  requirement, so a push channel plus gap-triggered refetch achieves the same
  perceived freshness for a fraction of the architecture. See the sync-tier
  discussion that preceded this ADR.
- A dedicated WebSocket channel was rejected over SSE: the codebase already
  parses `text/event-stream` manually in `agent-sse.ts` (EventSource can't
  send Authorization headers), and the stream is server-to-client only.

## Consequences

- Server restarts force one full refetch per connected client (by design: the
  sequence number jumps). Acceptable for a single-user deployment.
- If the interceptor ever misses a write path (e.g. raw SQL bypassing Prisma),
  clients will silently drift until restart. Keep domain writes on Prisma.
- Single-instance only: the hub is in-process. Horizontal scaling would
  require a real message bus — at that point, revisit this ADR.
