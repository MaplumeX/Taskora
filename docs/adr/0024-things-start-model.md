# Start + Scheduled Date replace Bucket + ScheduledType

Things 3 stores one tri-state per to-do, `TMTask.start` (Inbox / Anytime /
Someday), plus an optional start date. Every list is a filter over those two
fields, and Today is a subset of Anytime. Taskora stored two overlapping
fields instead: `bucket` (INBOX / ANYTIME / SCHEDULED) and `scheduledType`
(NONE / DATE / SOMEDAY). `bucket` was almost entirely derived from
`scheduledType` and ownership, needed `repairEntity` to keep the two in
step, and its SCHEDULED value had no Things counterpart. The derived views
drifted from Things as a result: Anytime required `scheduledType = NONE`,
so tasks scheduled for today never appeared there, although CONTEXT already
described their yellow star in Anytime.

## Decision

- Task and Project carry **`start`** (`INBOX` | `ANYTIME` | `SOMEDAY`) and
  **`scheduledDate`** (calendar date, nullable). `bucket` and
  `scheduledType` are removed from storage, the sync wire, DTOs and code.
  Projects never take `INBOX`.
- Invariants (writers keep them; `repairEntity` restores them after a merge):
  - `scheduledDate` is set only when `start = ANYTIME`. A dated task is
    "ANYTIME with a date": unlike the Things database, a future date is not
    stored as SOMEDAY and flipped on arrival, because that flip would be a
    write at midnight in the account time zone. Upcoming vs Today is
    derived from the date.
  - `INBOX` only for tasks without project, area or date. Repair: an INBOX
    task that gained an owner or a date becomes `ANYTIME` (triage wins).
  - A SOMEDAY row that has a date loses the date (Someday wins, as the old
    "leaving DATE clears the date" rule).
  - Reminder and Repeat Rule need a date. Repair clears them when
    `scheduledDate` is null.
- Views (`engine/src/domain/views.ts`, shared by device and hub):
  - Inbox: `start = INBOX`.
  - Anytime: `start = ANYTIME` and (no date, or date ≤ today), excluding
    Later Projects' tasks. Today's tasks appear with the yellow star.
    Anytime now depends on the account time zone.
  - Today: date ≤ today, or deadline ≤ today (unchanged).
  - Upcoming: date > today. Someday: `start = SOMEDAY`.
- Writes follow Things: setting a date sets `ANYTIME`; Someday sets
  `SOMEDAY` and clears the date; **Clear sets `ANYTIME` and clears the
  date** — an unowned task no longer falls back to the Inbox when its
  schedule is cleared. Moving to the Inbox sets `INBOX` and clears
  ownership and schedule, keeping the deadline. Giving an Inbox task an
  owner moves it to `ANYTIME`.
- Sync protocol 7; the hub's minimum protocol rises to 7, because older
  clients keep writing `bucket` and `scheduledType`. The hub Prisma
  migration and Local Replica migration convert identically:
  - `SOMEDAY` → `SOMEDAY`; `DATE` → `ANYTIME` (a DATE row without a date
    stays ANYTIME without one); `NONE` → `INBOX` when the task's bucket was
    INBOX and it has no owner, otherwise `ANYTIME`; projects → `ANYTIME`
    unless SOMEDAY.
  - The `start` clock is the greater of the old `bucket` and
    `scheduledType` clocks (lexicographic on canonical HLC strings).
  - Outbox events are rewritten field by field the same way; devices
    bootstrap once on a protocol-7 hub, as for nested tags (ADR 0016).

## Considered: keep `scheduledType`, replace `bucket` with an inbox flag

Smaller diff, and it matches the vocabulary of Things' Shortcuts actions
(Start: On Date / Anytime / Someday). Rejected in favour of mirroring the
Things database directly: one field for "where does this live", one for
"which day", with no third value to keep consistent.

## Consequences

- Clearing the schedule of a loose task now leaves it in Anytime. This
  matches Things (the When picker's Clear "assigns the task to Anytime").
- The Anytime view needs the account time zone, like Today and Upcoming.
- Clients older than protocol 7 get 426 and must upgrade before syncing;
  their Outbox is kept and converted by the replica migration.
