# Logging Mode is derived from an account watermark, not a per-item field

Things 3 lets users choose when settled items move to the Logbook:
immediately, daily, or manually (with a "Log Completed" command). Taskora
adopts the same three Logging Modes. Until now an item left its view the
moment it was settled; with Daily or Manual it must stay in place, struck
through, as an Unlogged Item until it is logged.

## Decision

- "Logged" is **derived**, never stored on Task or Project. Two account
  preferences drive it: `loggingMode` (`IMMEDIATE` | `DAILY` | `MANUAL`,
  default `IMMEDIATE`) and `loggedThrough` (an ISO instant, nullable). A
  settled item is logged when any of these holds:
  - the mode is `IMMEDIATE`;
  - its `settledAt` ≤ `loggedThrough`;
  - the mode is `DAILY` and its settlement day, in the account time zone
    (ADR 0013), is before today;
  - its `settledAt` is before the Archived Logbook cutoff.
  Every item is judged by its own settlement time. Completing a project
  settles its open tasks at the same moment, so they move together; a task
  settled long before its project is not pulled back into its views.
- **Log Completed** advances `loggedThrough` to now. That is one preference
  write, whatever the number of items. Its undo sets the watermark back to
  the previous value. That is the only time the watermark moves backwards.
- Changing the mode away from `IMMEDIATE`, or between `DAILY` and `MANUAL`,
  sets `loggedThrough` to now, so items settled earlier do not reappear.
  Switching back to `IMMEDIATE` writes nothing.
- Both preferences sync last-writer-wins. Unlike `todayReviewedOn`, they are
  not max-merged, because undo needs to move the watermark backwards.
- The Archived Logbook rule (`engine/src/archive.ts`) does not change and
  does not read preferences. Anything old enough to be archived already
  counts as logged.
- The rule lives in `engine/src/domain/logging.ts` (`settledIsLogged`) and
  is applied through the view context (`ViewContext.logging`) by
  `taskMatchesView`, `projectMatchesView`, `taskMatchesQuery` and
  `planTaskSearch`, on the device engine and the hub alike. A missing
  `logging` means Immediately, so callers that do not pass it keep the old
  behaviour.

## Considered: a `loggedAt` field on Task and Project

Log Completed would then write one field per item: hundreds of synced writes
and Change Events for a single gesture, plus a migration and a new field on
both entities. The watermark makes the command O(1) and keeps entity data
untouched, the same approach as New in Today (`todayReviewedOn`).

## Consequences

- Logged state depends on the clocks that produced `settledAt` and
  `loggedThrough`. Clock skew between devices can make an item settled
  around a Log Completed land on either side of the watermark. This is
  accepted.
- Reopening and settling again refreshes `settledAt`, so the item becomes
  Unlogged again. That is the intended behaviour.
- Concurrent Log Completed and undo on two devices resolve by LWW. At worst,
  a few items stay in their views or move to the Logbook earlier than
  expected.
- In Manual mode, items left unlogged past the archive retention (365 days
  by default) count as logged. The device prunes them from its replica, so
  they would have dropped out of their views anyway.
- Outside Immediately mode the view prefilters can no longer restrict
  `status` in SQL, so the open views read settled rows too. The device
  replica is bounded by the archive retention; the hub reads them only in
  REST mode.
- Preferences are not replica data, so the engine does not notify on them.
  The app re-runs the view queries when the mode, the watermark or the
  calendar day changes (`useCalendarQueryRefresh`).
