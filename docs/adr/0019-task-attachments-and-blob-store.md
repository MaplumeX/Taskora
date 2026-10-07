---
status: accepted
---

# Task attachments: synced metadata, content-addressed blobs

Users want to attach files to a Task. Things 3, which Taskora otherwise
follows closely, has no attachments (its notes only hold links), so this is a
deliberate departure, and we keep it narrow: attachments belong to **Task
only** (not Project or Area), and v1 does not embed them in notes.

The sync protocol (ADR-0007) is built for small, independently editable
fields that merge by field-level LWW and travel as Change Events through the
Outbox; the hub caps JSON bodies at 4 MB. File bytes fit none of that. We split
an attachment into two layers:

- **Attachment** is a new synced entity (`attachment` in `ENTITIES`, Prisma
  model `Attachment`): `taskId`, `name`, `mimeType`, `size`, `blobHash`,
  `position`, `createdAt`, `updatedAt`. It merges, queues and replays exactly
  like Subtask.
- **Blob** is the file content, addressed by its sha256 and immutable once
  written. Blobs move over dedicated upload / download endpoints, never inside
  a Change Event. Because a blob never changes, it never conflicts and needs no
  clock. Renaming or reordering an attachment is a field write; replacing its
  content is remove + add.

## Decisions

- **Lifecycle follows Subtask.** An attachment exists only inside its parent
  Task, has no `trashedAt` of its own, follows the task into and out of Trash,
  and is hard-deleted with it (every hub path that hard-deletes tasks cascades
  to attachments and registers them in `CompactedEntity`). Removing a single
  attachment is a Delete Request (ADR-0008).
- **Blobs are outside the replica's "full copy".** Devices sync all
  Attachment rows but download a blob only when it is opened or previewed,
  then cache it locally in the webview's Cache Storage (same code on web,
  desktop and mobile). The cache is disposable. Archived Logbook pruning also prunes the attachment rows of the
  tasks it prunes.
- **Uploads have their own queue.** Adding an attachment offline writes the
  row to the Outbox at once and puts the bytes in a persistent device-side
  upload queue. The Outbox never waits on uploads. A device that receives the
  row before the blob exists on the hub shows the attachment as "waiting for
  upload" and retries the download later. Uploads are idempotent by hash; the
  hub verifies the hash of what it receives.
- **Hub storage is per-user and deduplicated.** Blobs are keyed by
  `(userId, sha256)`; we never dedupe across users, so a hash cannot be used to
  probe whether someone else has a file. v1 stores blobs on the local
  filesystem (a Docker volume) behind a `BlobStore` interface, so an
  S3-compatible backend can be added later. Blobs no longer referenced by any
  Attachment row are removed by hub GC after a grace period, which covers the
  window between an upload and the push of the row that references it.
- **No size limit or quota.** This is a self-hosted personal tool; the
  operator owns the disk. Uploads stream to storage and never pass through
  the JSON body parser.
- **Repeat derivation copies attachments.** Repeat Instances and Repeat
  Project Instances copy each attachment row, pointing at the same blob; the
  copy costs nothing. Derived attachment ids are deterministic, as for
  subtasks (ADR-0012): `hash('attachment', parentInstanceId, ordinal)`.
- **Downloads are hostile by default.** Every blob request is authenticated
  and scoped to the user; responses carry `Content-Disposition: attachment`
  and `X-Content-Type-Options: nosniff`. Only a whitelist of raster image
  types is previewed inline; HTML and SVG are never rendered.

## Considered Options

- **Blob bytes inside Change Events (base64 field).** Rejected: it blows the
  body limit, bloats the persisted pull log and every bootstrap, and forces
  every device to download every file.
- **Blob uploads gating the Outbox.** Rejected: one large upload on a slow
  link would stall every other write, which breaks "offline is
  full-functionality".
- **Attachments as links inside notes.** Rejected for v1: notes are a single
  LWW string, so attachment lifecycle (GC, Trash, repeat copy) would depend on
  parsing Markdown. Inline references (`taskora-attachment://<id>`) remain
  possible later on top of this model.

## Consequences

- Assistant tools see attachment metadata only, never blob content.
- The hub gains a stateful volume; backup and restore must include it.
