# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

> **注**：自 v0.3.0 起桌面端与仓库其余包统一版本号、随 `v*` tag 同步发版；
> 移动端（Android）自首个版本起即纳入同一单轨。CHANGELOG 不单设 Desktop /
> Android 小节，端专属改动标注 `(desktop)` / `(android)`。
> 此前的 `## Desktop [x.y.z]` 小节是双轨制时期的历史记录。

## [0.7.0] - 2026-09-30

### Added

- **engine/api/backend**: Local-first v3 — field-level merges can no longer
  produce entities that violate cross-field invariants (#117) — concurrent
  edits on two devices could each be valid on their own yet combine into an
  invalid entity: a heading owned by another project, a Someday task
  carrying a reminder or repeat rule, a DATE task in the Anytime bucket, an
  active task with a settled time. Both hubs now run the same pure
  `repairEntity` (the rules the REST services always enforced) after
  merging and scrubbing, writing corrections with a winning
  virtual-device-0 clock so every device converges; the tightening side
  wins and consistent states are left alone, keeping normal echoes no-ops.
  The rules themselves (bucket derivation, view filters and sorting,
  delete/restore cascades, convert-to-project, repeat derivation) moved into
  `@taskora/engine/src/domain`, and the Engine backends and the REST
  services are now read → rule → write, with one shared fixture run as a
  contract test on both sides; the "same semantics as REST" comments are
  gone. Unifying them also settled a batch of drifts: device search with
  `completed` now returns settled and unsettled tasks like REST, device
  Logbook sorts by settled time, feeds mix tasks and projects by Position,
  completing an already completed task is a no-op, cascading a project or
  heading into Trash no longer rewrites tasks already in Trash (restoring
  the project no longer resurrects individually deleted tasks), cascaded
  tasks lose their reminders, and converting a task to a project derives
  the bucket instead of copying INBOX.
- **engine/api/backend**: The replica schema and the sync protocol are
  versioned (#117) — the replica tracks migrations with `PRAGMA
user_version` and an append-only list (one transaction per step) instead
  of ad-hoc column probes, and an installation pointing at a newer replica
  is refused with a "upgrade Taskora to sync" state instead of silently
  downgrading. Requests carry `x-taskora-sync-protocol` /
  `x-taskora-client`, responses carry `protocolVersion` /
  `minProtocolVersion`, and a hub requiring a newer protocol answers 426:
  syncing stops, the Outbox is kept and the UI asks the user to upgrade.
  Unknown entity types in a push are rejected one by one and reported
  (`PushResponse.rejected`) instead of failing the whole batch, unknown
  remote entities are skipped on pull, and rejected entries stay in the
  Outbox for a later hub upgrade.
- **engine/api/backend**: Device clocks are calibrated to hub time and the
  change log lives in Postgres (#117) — sync responses carry `serverTime`
  and the Engine derives an NTP-style wall-clock offset (RTT ≤ 5 s),
  persists it and applies it to HLC stamps, while `HybridClock.receive`
  absorbs remote stamps at most `MAX_CLOCK_DRIFT_MS` (1 h) beyond
  calibrated now, so hub-synthesized virtual-device-0 clocks (REST/web
  writes) compare fairly against device HLCs. The in-memory pull ring
  buffer became `SyncChange` / `SyncCounter` tables with per-user
  `UPSERT … RETURNING` seq allocation and 30-day hourly pruning, so hub
  restarts and multiple hub instances share one log and no longer force
  every device into a full bootstrap.
- **engine/api/backend/frontend**: web runs the Engine and REST writes go
  through the merger (#117) — every REST service is now read → domain rule
  → `writeAsHub`, sharing one transactional row-level merge (lock → LWW →
  reference scrub → invariant repair → persist) with device pushes and
  appending to the change log in the same transaction, which retired the
  serialized field-digest detection, the collector tap's sync branch and
  `publishCompact` / `submitVirtualWrite`. On the client, web runs the real
  Engine on `@sqlite.org/sqlite-wasm` + OPFS (one pool directory per
  account) with Web Locks electing a leader tab that owns the replica,
  HLC, Outbox and sync loop while the other tabs proxy reads and writes
  over a `BroadcastChannel` and take over when the leader closes; browsers
  without OPFS/Web Locks, an unreadable replica or a newer replica fall
  back to the REST path and show the upgrade state.
- **engine/api/ui**: Engine-mode reads are reactive live queries (#117) —
  `Engine.watch(query, callback)` lets a query declare the entities (and
  optionally ids) it depends on, reruns only the affected queries after a
  transaction commits, merges same-tick notifications, discards results
  invalidated while in flight and structurally shares unchanged results;
  `useEngineQuery` / `useReplicaQuery` replace React Query in Engine mode
  for task lists and details, feeds, projects, areas, tags, tag groups and
  headings, while optimistic patches stay (Tauri IPC still costs a few
  frames) but go through a mode-dispatching `useQueryCache` facade that
  patches every cached shape of an entity, including project rows and tag
  chips embedded in feeds.
- **engine/api/backend**: Sync no longer ships the whole database (#117) —
  bootstrap is paged (≤ 500 rows per page, ordered structure → unsettled
  tasks → settled tasks → subtasks → compact registry, with a cursor fence
  fixed on the first page and a stateless token), devices stage the pages
  into `_stage_*` tables and swap them in one transaction so a rebuild
  never exposes half a database, while a brand-new device merges pages by
  LWW and can render as soon as the first page lands. Settled tasks older
  than the archive window (365 days by default, `archiveAfterDays`, `null`
  keeps everything) are dropped from the replica and from bootstrap and
  are instead read from a new read-only, keyset-paged
  `GET /feed/logbook/archive` that the Logbook page pulls as it scrolls,
  with archived rows returning to the replica (and their subtasks
  backfilled) when the hub changes them; compact registries now expire
  after the log retention window on both sides, and push treats writes to
  missing rows and dangling references as compactions/deletions instead of
  building partial rows or retrying forever.
- **engine/api/backend/mobile**: Android syncs reminders in the background
  (#117) — instead of a headless WebView or reimplementing reminder rules
  in Kotlin, the hub computes the full plan with the same shared domain
  code (`planReminderDeliveries` in `@taskora/engine/src/domain`, used by
  both the replica coordinator and the hub) and exposes it at
  `GET /reminders/plan`; device registration can request a read-only
  30-day `backgroundToken` (rotated on every registration), a WorkManager
  job runs every 15 minutes when online and not battery-saving and applies
  the plan, and the two writers are ordered by a `PlanSource` (a non-empty
  Outbox or a locally delivered change keeps JS in charge, and the queue's
  notification actions always stay with JS).
- **engine/api/backend/ui**: Repeating tasks v2 (#118) — three additions on
  top of v1. **Skip occurrence**: a new "skip" action in the task context
  menu (disabled with a reason at the end of the chain) rewrites the
  current occurrence in place — `scheduledDate` advances by the rule to the
  first occurrence after the original date that is not before today
  (account time zone), an existing `dueDate` shifts by the same number of
  days, all subtasks go back to ACTIVE and `reminderTime` is kept — with no
  new task and no Logbook entry; the shared `planRepeatSkip` /
  `skipOccurrenceDate` live in the engine domain and are used by the device
  backend and by a new `POST /tasks/:id/skip`, which returns the reason as
  a 409 the client turns back into `RepeatSkipBlockedError`. **`repeatSourceId`**:
  derived instances now record their source task, so un-completing no
  longer deletes the instance (user edits survive complete → undo →
  re-complete, and completion-anchored tasks no longer derive a second
  instance a day later); derivation is idempotent through "source already
  has a live instance" with the deterministic id as the fallback, and an
  instance left in Trash still counts as gone. **Repeat previews**:
  Upcoming and Calendar project the next occurrence of each
  scheduled-anchored chain as a grey read-only ↻ row (one preview per
  chain, never in the past, nothing for completion anchors), derived purely
  by `buildRepeatPreviews` and excluded from selection and drag.
- **backend**: The assistant can set up repeats (#118) — `create_task` and
  `update_task` accept a structured `repeatRule` (unit / interval /
  weekdays / anchor / until, validated by `normalizeRepeatRule` with
  readable errors the model can correct), `update_task` also accepts
  `skipOccurrence`, and `list_tasks` / `get_task` / `list_feed` return the
  rule so the assistant can see and explain recurring tasks.
- **api/ui/mobile**: Touch multi-select mode (#119) — long-press on a task
  row now only starts a drag; row and bulk actions moved to a swipe-left
  gesture that enters Multi-Select Mode, matching Things 3 on the iPhone.
  A swipe locks to its main axis after 8 px, only counts as a selection
  swipe when it moves left within 250 ms of touch-down (the drag sensor
  needs 300 ms, so the two cannot overlap), follows the finger up to 88 px
  and commits at 64 px, revealing a multi-select icon; the native
  `contextmenu` Android dispatches on long-press is simply suppressed. The
  mode itself lives in `useMultiSelectStore` (separate from the keyboard
  Selection), clears Selection and collapses expanded rows on entry,
  highlights checked rows and replaces the FAB with a
  `MultiSelectToolbar` offering Plan / Move / Delete / More (Complete,
  Cancel, Due date, plus Tag / Repeat / Convert to project when exactly one
  row is checked); field edits reuse the `FieldPickerDialog` card. Exits
  are the completed action, Done, a route change and the Android back
  button, which now runs after overlays close and before route navigation;
  Trash and subtask rows keep their long-press menu, and search and the
  calendar day sheet disable the swipe because the toolbar would be
  covered.
- **mobile**: Root-page back now backgrounds the app instead of killing it
  (#116) — a new repo-local `tauri-plugin-background` exposes
  `moveTaskToBack` from the Activity (the shell's `app_exit` command is
  gone), matching native Android behaviour: WebView state and the task
  survive, so returning from Recents resumes in place instead of cold
  starting.

### Changed

- **ui**: Area detail pages no longer render empty states (#115) — the
  "no projects"/"no tasks" copy and its translations were removed, so an
  area with nothing to show only lists the rows that exist.

### Fixed

- **engine/api/backend**: A batch of sync defects found in the review
  (#117) — the Outbox now only coalesces into its tail row, keeping causal
  order so any batch prefix commits (the old merge-into-an-earlier-row
  behaviour deadlocked on foreign keys across 500-row batches; a new
  real-Engine Postgres e2e drives a 601-row offline backlog through the
  hub); push batches are capped at 256 KB and the backend JSON limit and
  nginx body size are raised to 4 MB (the former 100 KB default rejected
  roughly fifty offline creates forever); compacted ids are persisted in
  `_compacted` so repeat re-derivation cannot reuse a dead deterministic id
  after a restart, and a late write to a compacted id makes the hub
  re-broadcast its Compact Event; field values the hub cannot store
  (unknown enum values from newer clients, invalid dates, malformed JSON or
  tagIds) now get a winning virtual-device-0 clock so the pusher adopts the
  stored value instead of keeping its own forever; HLC state is written
  inside the transaction that used it; reorders assign new positions only
  to the rows that must move; replica writes and remote batches run in one
  transaction with one change notification; inflation checks and
  rebalancing stay inside SQLite and rewrite only the inflated run; and
  engine reads accept SQL prefilters (whitelisted fields) backed by new
  indexes, so active views and project counts no longer scan the whole
  Logbook.

## [0.6.2] - 2026-09-30

### Added

- **api/ui**: Later Projects (#113) — Someday projects and projects with a
  Scheduled Date later than today are now treated as one hibernating
  "Later Project" concept, following Things 3. A single pure predicate
  (`laterProjectKind` in `@taskora/shared`, fed the account time zone's
  today key) is the only decision point, so the sidebar, the new page, the
  area page and the task-view filters can never disagree; the state stays
  fully derived with no cascade writes, so waking a project brings its
  tasks back unchanged. The sidebar hides later projects entirely and
  collapses the no-area ones into a muted "N later projects" row pinned at
  the end of the standalone list, rendered outside the `SortableContext`
  (so it cannot be dragged or used as a drop target) and appearing only
  when N ≥ 1; area-owned later projects show only on their area page. A
  new `/later-projects` route (registered in all three shells) lists the
  no-area ones under "Scheduled" and "Someday" section headings, sorted by
  date then order and by order respectively, with no drag handles; the
  area page renders the same sections below its active projects and tasks,
  and keyboard selection now walks active projects → tasks → Scheduled →
  Someday via an explicit rank. Rows reuse `ProjectFeedRow`, and the plan
  section carries a date chip. Tasks inside a later project are excluded
  from Anytime and Someday (dated ones still reach Today / Upcoming,
  matching Things 3); the backend view predicate, the local engine's
  `taskMatchesView` and the event-stream matcher all learned the parent
  rule, the last so that changing a project's status, `scheduledType` or
  `scheduledDate` re-matches its tasks' queries. Sidebar reordering now
  serializes the full project order (visible items fill their old slots,
  hidden ones keep theirs) so hidden projects rejoin without number
  collisions; dragging a later project onto an area row changes only its
  area and never wakes it.
- **api/mobile/desktop**: Reminder notifications gained actions and task
  reveal (#112) — a reminder notification now offers Complete and Snooze
  (15 minutes / 1 hour / tomorrow) and its body reads
  `HH:mm · <project or area>`, appending the first line of the note and
  localizing every string through the `task` namespace, so the shells
  carry no translations. Tapping the body brings the app forward, expands
  the reminded task and routes to the view that can hold it (Today when
  visible there, otherwise its project, its area, or its bucket's list; a
  completed or trashed task only opens the app). Actions run through a new
  pure Reminder Action module: it discards a late action when the task is
  settled, trashed, gone, or its current reminder `fireAt` no longer
  matches the notification snapshot, applies Complete through the shared
  `completeTask` path with `settledAt = tappedAt` (so Logbook grouping and
  repeat-instance derivation stay correct), and applies Snooze as a plain
  `scheduledDate` + `reminderTime` rewrite that syncs like any other field
  edit; replays are idempotent. Android extends the repo-local reminders
  plugin (ADR-0014): the plan gains `taskId` and a JS-computed
  `snoozeTomorrowAt`, the notification exposes Complete / 15 minutes /
  Later… (a native dialog with 1 hour / tomorrow), and a receiver cancels
  or re-arms the alarm and appends the action to a persisted queue that JS
  drains on start and via an `actions-available` event — all without
  launching the app, so a killed process still completes or re-schedules
  on time. Desktop bypasses `tauri-plugin-notification` for sending: a new
  Rust `show_reminder` command posts buttons through
  `tauri-winrt-notification` (all four actions flat on Windows),
  `notify-rust` XDG actions on Linux and `mac-notification-sys` on macOS
  (Complete plus a snooze dropdown), emitting a `reminder-action` event
  after focusing the window; the plugin is kept only for permission
  commands.

### Changed

- **ui**: Project rows in list views were unified on `ProjectFeedRow`
  (#114) — the area page and Later Projects page now render the same row
  as the Today / Upcoming feeds (accepting either a `ProjectFeedItem` or a
  `ProjectResponseDto`), while `ProjectItem` is reduced to the sidebar's
  compact 28px row with its 16px progress ring. The area page drops its
  "Projects" and "Tasks" section labels, and section and heading titles
  render bold.
- **mobile**: The status-bar quick-add overlay now draws its own scrim and
  card on a fully transparent Activity and animates them in and out
  (#111) — a 150ms fade plus a decelerating slide-in, and a 120ms
  accelerating fade plus slide-out on dismiss, with the system task
  transition and the starting window disabled so closing the overlay no
  longer plays the "window shrinking back to the launcher icon" task
  animation. The scrim extends under the status and navigation bars, and
  the keyboard is requested on the next frame instead of after a 100ms
  delay.

## [0.6.1] - 2026-09-28

### Changed

- **ui**: Native date, time and repeat inputs replaced with custom
  pickers (#109) — the Reminder time drops `<input type="time">` for a
  new `TimePicker`: the trigger shows `HH:mm` and opens two scrollable
  columns (24 hours, 60 minutes) that center the current value, move
  focus with ↑/↓ and write on pick, on an opaque surface so the
  calendar underneath does not show through a translucent popover. The
  Repeat Rule panel swaps its native checkbox and `<select>` for a
  Switch plus a segmented unit control ("Every N" on its own line,
  unit as a `radiogroup`), and the repeat entry is removed from the
  expanded task row — the row's ↻ badge stays, but the context-menu /
  long-press item is now the only editor, since repeat is a set-once
  setting. In the date popover, Clear moves from a full-width footer
  row to a calendar ✕ icon at the end of the shortcut row, and the
  calendar tightens (28px day buttons and nav, smaller gaps, no footer
  separator).

### Fixes

- **api**: `Someday` labels were left untranslated in the Chinese
  locale (#110) — `task:somedayLabel` and `task:somedayEmpty` in
  `zh/task.json` still read "Someday"; they are now 「将来」 and
  「没有将来任务」.
- **desktop**: Launch-at-login was silently switched off by every
  manual upgrade (#108) — Windows NSIS runs the previous uninstaller
  without `/UPDATE` when installing a new package over an old one, and
  its uninstall section deletes
  `HKCU\...\CurrentVersion\Run`, so the login item vanished on each
  upgrade while the Settings toggle faithfully reported the system
  state. The shell now persists the user's intent in
  `app_data_dir/launch-at-login.json` and reconciles it against the
  system login item on startup: re-enable and refresh the executable
  path when the entry is missing, adopt the system state when there is
  no positive intent (old installs, re-enabling from system settings),
  and yield when Windows has the Run value but marks it disabled in
  Task Manager. Reconciliation is skipped in debug builds (dev and
  release share the login item name, so refreshing would point
  autostart at `target/debug`). Settings now call the shell's
  `launch_at_login_get` / `launch_at_login_set` commands; the
  `@tauri-apps/plugin-autostart` JS dependency and the
  `autostart:default` capability are removed. One-time caveat: the
  upgrade to this version is still cleared by the old uninstaller (no
  intent file exists yet), so the toggle must be turned on once more.
- **api/ui**: Past Scheduled Dates were pulled into today's Calendar
  cell (#107) — the calendar applied the "a past When counts as today"
  rule when grouping tasks, so overdue tasks were painted on today and
  vanished from the day they were actually planned; grouping now uses
  the stored date and the Calendar highlights today independently
  (re-rendering across midnight). The Things 3 semantics stay in the
  task card: a past date is shown as Today selected, the stored value
  is not rewritten, and turning on or changing a Reminder now writes
  the Scheduled Date as today as well, so the reminder is not anchored
  in the past and never fires.
- **api**: Remote profile edits stayed invisible until the local
  Settings form was saved (#106) — the shell avatar and display name
  read from `useAuthStore.user`, but `useCurrentUser` only hydrated
  preferences from the polled `/auth/me` response and never the user
  itself. The fetched profile is now mirrored into the store, guarded
  by a live token and a matching user id so a cached response cannot
  resurrect a cleared session.

## [0.6.0] - 2026-09-27

### Changed

- **ui**: Things 3-style visual language and shared design tokens across
  all three shells (#105) — the theme duplicated in every shell is
  consolidated into `packages/ui` (`styles/tokens.css` +
  `tailwind.preset.js`), which the shells now import. A new light/dark
  token palette (white canvas, gray sidebar, blue interaction color,
  semantic today/deadline/success/warning and per-bucket nav colors)
  replaces the old colors, the system font stack replaces Google Fonts,
  and a type scale is registered with tailwind-merge. Primitives are
  restyled (macOS-style glass menus, quieter buttons/inputs, iOS switch,
  hairline separators, a global reduced-motion fallback); task rows
  become 32px with a selection color, tag capsules and a Things-style
  checkbox whose completion holds briefly before collapsing (undoable
  during the hold, `useCompletionRhythm`); the expanded task becomes a
  lifted card with set fields as chips and unset fields as toolbar
  icons; sidebars use colored bucket icons, 28px rows and spacing
  instead of separators; group headers, project feed rows and one shared
  `EmptyState` (replacing five ad-hoc implementations) follow the same
  rules. Scheduled/deadline pickers gain a vertical shortcut list
  (today/tomorrow/someday, current value checkmarked) above the month
  calendar with a single full-width Clear; login/register/server-setup
  cards flatten to a borderless rounded-xl card. A final contrast and
  motion pass tunes tokens to WCAG AA (icons to 3:1) and routes
  durations through `--dur-fast`.
- **mobile**: Things 3-style navigation, dense calendar grid and
  Material settings (#104) — the bottom tab bar is replaced by a
  Things 3-style home list, and the scheduling/deadline/repeat/tag
  entries of an expanded task open as centered modal cards on narrow
  screens (`FieldPicker`) instead of anchored popovers, so the calendar
  is fully visible wherever the task sits; picking a day keeps the
  card open so a reminder can be set right away. The Calendar month
  view becomes a dense chip grid (10px chips and no in-cell checkbox on
  narrow, 12px with ellipsis on wide, `+N` overflow) where the whole
  cell is a button opening that day's full task list in a bottom sheet
  (a 28rem centered card on wide screens). Settings gain two-level push
  navigation with list rows and a Material (Android) treatment:
  back-arrow top bar with a left-aligned title, monochrome icons,
  leading radio buttons, primary-colored section headers, 16px/56px
  rows and a primary switch sized 52×32 on narrow screens.

### Fixes

- **api/mobile**: Android Reminder delivery moved into a repo-local
  native plugin (#103, ADR-0014) — JS stays the single source of
  Reminder rules and computes the whole desired plan (key, epoch
  `fireAt` in the account time zone, title, body), handing it over
  through one idempotent `sync(plan)` call; the new
  `packages/mobile/plugins/reminders` owns everything stateful: it
  persists the plan, diffs against its own copy, arms
  `setExactAndAllowWhileIdle` alarms, re-arms on `BOOT_COMPLETED`,
  `MY_PACKAGE_REPLACED` and every app start, posts the notification when
  an alarm fires, and manages the `reminders` channel and permission
  state. This removes root causes the previous JS call chain could not
  reach: `tauri-plugin-notification` 2.4.0 never persisted notifications
  created through `notify` (so nothing survived a reboot), silently fell
  back to inexact alarms without exact-alarm permission on Android 12+
  (firing up to an hour late), and the coordinator's in-memory
  `registered` map vanished with the process so alarms for Tasks
  completed, trashed or reminder-disabled elsewhere were never
  cancelled. Reminders missed while the device is off are dropped,
  matching the desktop rule. A new Reminder reliability settings
  section surfaces notification permission, channel state, exact-alarm
  capability and battery-optimization exemption with jumps to the
  relevant system pages (including OEM autostart screens). Desktop keeps
  its runtime scheduler and `tauri-plugin-notification`.
- **mobile**: The Android status-bar QuickAdd overlay pulled the whole
  app to the foreground (#102) — tapping "＋" opened the entry overlay
  but also brought the main activity forward, because the transparent
  `QuickAddActivity` defaulted to the app's main task and made the
  underlying MainActivity visible/resumed behind it. The activity now
  declares `android:taskAffinity=""` and `launchMode="singleTask"`, so
  the overlay lives in its own task and whatever app was in front stays
  behind it. The cold-start path (process killed, Tauri start brings
  MainActivity up) remains a known edge.

## [0.5.5] - 2026-09-27

### Changed

- **mobile**: Status bar notification switched to a single-line custom
  layout (#100) — the ongoing notification no longer uses the
  notification plugin's standard template (task title plus a separate
  system action row); a new in-repo Kotlin plugin
  `tauri-plugin-statusbar` (`packages/mobile/plugins/statusbar`, a path
  dependency modeled on `tauri-plugin-timer`) backs a `RemoteViews`
  layout with the single-line task title and two larger vector icon
  buttons, matching the TickTick form. A `specialUse` foreground
  service (`START_STICKY`) holds the notification and snapshots its
  content to `SharedPreferences` so a sticky restart can rebuild it;
  "▸" cycles to the next task through a manifest-registered receiver
  that forwards to JS via `plugin.trigger` (now returning early with
  `goAsync()` so the main activity is not pulled forward), and "＋"
  opens a translucent `QuickAddActivity` overlay whose submitted title
  reaches JS the same way (buffered in `SharedPreferences` and flushed
  on plugin load when the process was cold). The notification is no
  longer expandable (no `BigContentView`). The platform-agnostic
  `StatusBarShell` interface and controller are unchanged.

### Fixes

- **api/mobile**: Android Task Reminders could stay silent even with
  the app in the foreground (#98) — notification IDs were generated as
  unsigned 32-bit numbers while the plugin's Rust/native notification
  IDs are signed `i32`/`Int`, so some stable task IDs always overflowed
  and registration failed every time; IDs are now stable signed 32-bit
  integers (previously working positive IDs are unchanged). The
  scheduler's diff now distinguishes `due` (naturally elapsed) from
  `cancel` (rescheduled/disabled/terminal) so a naturally-due reminder
  on mobile no longer has its pending system schedule revoked; logout
  and stop still clear pending items, and the desktop runtime keeps
  firing at the due time. A shared `notification-bridge` now provides
  live native permission query/request and channel checks for both
  reminders and the status bar, refreshing permission state and
  rescheduling future reminders on return to the foreground.
- **desktop**: Notification permission was misreported as disabled and
  changes made in system settings were not picked up (#101) — the
  desktop shell now calls the native `plugin:notification|*` commands
  directly instead of going through the plugin's guest-js, whose
  `isPermissionGranted`/`requestPermission` read the session-local
  `window.Notification.permission` cache (on Windows that cache is
  initialized to `denied` at startup without querying the OS, so
  notifications fired fine yet the app always claimed they were
  disabled). Permission failures now return `false` instead of
  throwing, matching the mobile `notification-bridge` behavior.
- **ui**: Launch-at-login was shown on the mobile shell (#99) — the
  General settings tab only checked for `__TAURI_INTERNALS__`, but the
  mobile app is also a Tauri shell, so Android displayed a desktop-only
  toggle. The desktop check now also requires
  `getClientKind() === 'desktop'`.

## [0.5.4] - 2026-09-26

### Fixes

- **backend**: Runtime image was missing workspace package
  `node_modules` (#97) — the runtime stage copied only the root
  `node_modules` plus each workspace package's `dist` and
  `package.json`, so the per-package symlink trees that pnpm creates
  were absent: `@taskora/shared`'s `@js-temporal/polyfill` lives in
  `packages/shared/node_modules` (the root directory holds only the
  `.pnpm` store, since the root package has no dependencies of its
  own), so `require` resolve walked up past the package and failed at
  startup. The Dockerfile now also copies
  `packages/shared/node_modules` and `packages/engine/node_modules`
  into the runtime stage.

## [0.5.3] - 2026-09-26

### Added

- **api/backend**: Account time zone for calendar dates and reminders
  (#95) — Scheduled Date and Deadline are calendar dates, not instants,
  so new clients write `YYYY-MM-DD` (the REST DateTime columns keep
  encoding those dates at UTC midnight) and no reader applies the
  device offset anymore; this fixes "scheduled today + daily repeat
  produces another instance still on today", which came from mixing a
  local-midnight ISO with a UTC day key. An account-level IANA zone —
  initialized to the first device's zone and persisted with
  preferences, with a Settings entry to change it — now drives every
  calendar consumer: Today/Upcoming for tasks, projects and the event
  cache, the date quick-picks and calendar highlight, deadline
  countdowns, Logbook grouping and badges, completion-anchored Repeat
  Rules and their previews, reminder scheduling/wording and
  rescheduling on zone change, the Android status bar, the assistant's
  per-conversation current date, and export filenames. Legacy
  non-midnight values are decoded through a server-managed
  `legacyDateTimeZone` captured once at first initialization so old
  dates do not move when the setting changes (a UTC-midnight encoding
  is indistinguishable from a stored calendar date and keeps its UTC
  date); real instants (`createdAt`/`updatedAt`/`settledAt`/`trashedAt`,
  token expiry, sync HLC) stay absolute. Date math is pure and takes
  the zone explicitly — servers never use their own local zone. See
  [ADR-0013](docs/adr/0013-calendar-dates-and-account-time-zone.md).

### Changed

- **ui**: Full-screen settings panel on mobile (#93) — below the
  desktop breakpoint settings now open as a full-screen page (title bar
  with a top-right close button, horizontal tab strip, content scrolls
  the panel) instead of a cramped centered modal; a new `useMediaQuery`
  hook picks the layout, the dialog gains a `mobileFullscreen` variant
  that drops the centering transform and stretches to the viewport, and
  the panel height follows `--kb-inset` so the keyboard keeps the
  focused field visible, with safe-area padding for the notch and home
  indicator. The desktop centered modal with its left nav column is
  unchanged.
- **mobile**: Full-bleed Android launcher icons (#92) — a new
  `scripts/generate-android-icons.py` renders adaptive-icon
  foreground/legacy/round mipmaps across all five densities so the
  artwork fills the launcher mask instead of sitting in a padded
  square, with `scripts/sync-android-icons.mjs` wiring it into the
  sync step.

### Fixes

- **mobile**: Android status bar notifications never appeared (#94) —
  with the toggle on, the notification was missing from the shade
  because the locked `@tauri-apps/plugin-notification@2.4.0` calls
  `plugin:notification|listChannels` while the default ACL only allows
  `list_channels`, and Tauri checks the ACL before its camelCase
  conversion, so channel setup was rejected; the shell swallowed that
  error, cached the channel as ready and kept posting to a
  non-existent channel, while `sendNotification()`'s void return made
  the failure uncatchable. The mobile shell now uses a narrow shared
  bridge with the ACL-correct `list_channels` plus an awaitable
  `notify` command (same fix for the Reminder shell, no ACL widening
  and no dependency change), channel/action init failures are no
  longer cached and propagate, enabling now awaits the post and rolls
  the toggle back with a "check system notification settings" toast on
  failure, and regression tests exercise the real plugin JS API at the
  IPC boundary instead of mocking the shell.
- **desktop**: Reminder notifications were silent (#96) — the desktop
  notification shell never passed a `sound`, and
  tauri-plugin-notification turns a missing sound into notify-rust's
  `sound_name: None`, which is not "let the OS decide": winrt then
  writes `<audio silent="true"/>` on Windows and mac-notification-sys
  writes an empty soundName on macOS, so the toast appeared without a
  sound. `fireNow` now passes the platform's default-sound literal
  ("Default" for the winrt enum on Windows, "default" — the value of
  `NSUserNotificationDefaultSoundName` — on macOS; Linux is left
  untouched because notify-rust's XDG backend ignores `sound_name`),
  pinned by a shell test.

## [0.5.2] - 2026-09-26

### Added

- **mobile**: Android status bar quick add + pending tasks (#84) — a
  TickTick-style ongoing LOW-importance notification showing today's
  open tasks one at a time, with "＞" to cycle to the next task
  (cursor persisted across cold starts) and "＋" to quick-add via
  inline RemoteInput; the zero-task state shows a quick-add entry.
  Platform-agnostic content (sort/overdue prefix/carousel title) and
  the controller (cursor + debounce + session follow) live in
  @taskora/api/status-bar, the tauri-plugin-notification shell in
  @taskora/mobile/status-bar, with a Settings toggle (Android only)
  that walks the notification-permission flow, and an engine
  onChange hook refreshing content debounced.

### Changed

- **ui**: Task ownership renders as a subline below the title (#91)
  — the project/area tag moves from the right end of the task row to
  a muted line beneath the title, matching Things 3's two-segment
  row; rows with an owner grow naturally while ownerless tasks keep
  the compact single-line height, and ownership is now visible on
  mobile too. Grouped views keep group rows free of ownership tags
  (the header carries the context).
- **ui**: Past scheduled dates are treated as today, never overdue
  (#88) — When semantics aligned with Things 3: a scheduled date is
  a plan-to-start day, never a due date, so it can never go
  "overdue". Dates on or before today render a yellow star (Things 3
  Anytime semantics) across task rows, project rows and group
  headers; the red overdue date chip is gone and red urgency is now
  exclusive to deadlines. The calendar rolls past date keys into
  today so those tasks land in today's cell, and CONTEXT.md
  documents the Scheduled Date term.
- **ui**: Grouped View flattened to a single level with
  section-title headers (#85) — the nested area > project > task
  hierarchy is replaced by flat single-level groups: tasks join
  their direct parent's group only, so in-area project tasks cluster
  under the project header as a sibling of the area group. Group
  headers become lightweight underlined section titles (bold title +
  2px underline) with no collapse affordance — the collapse store,
  chevron buttons, bare ←/→ keymap actions and collapsed-group drop
  toast are removed. Group order follows the sidebar's global visual
  order; project headers keep the progress ring, date badges,
  context menu and detail navigation, and header rows stay droppable
  (drop lands at group end).
- **ui**: Task/project row alignment and settled styling cleanup
  (#90) — the task checkbox is wrapped in a 20px slot matching the
  project progress ring so task and project titles align in mixed
  lists; the cancelled checkbox now uses the same theme-color fill
  as completed, distinguished only by the X icon; strikethrough is
  reserved for cancelled across task rows, subtasks, calendar cells
  and project rows (completed titles are muted only); logbook
  entries drop the muted gray on titles.
- **ui**: Task checkbox reshaped to a rounded square (#87) — the
  circle becomes a rounded square, default size 18px → 14px
  (calendar compact override 12px), and the project progress ring
  grows 18px → 20px to match.

### Fixes

- **mobile**: Android reminders never fired — registration failures
  are now surfaced and self-heal (#83) — the failure chain was fully
  silent: sendNotification rejections escaped un-awaited, channel
  creation failures were cached for the whole session, and the
  coordinator recorded failed registrations as done so nothing ever
  retried. The mobile shell now awaits, logs and rethrows
  sendNotification failures, retries channel creation, and
  pre-checks permission; the coordinator no longer marks failed
  registrations as done, so the periodic tick retries and recovers
  once permission/channel are restored, without relying on data
  changes or an app restart. The desktop shell likewise awaits and
  logs fireNow failures.
- **calendar**: Cancelled task rows render with settled styling
  (#86) — calendar rows only handled COMPLETED, so cancelled tasks
  showed a plain open checkbox and a non-struck title, and clicking
  the circle completed them instead of uncancelling. Cancelled rows
  now get the muted X checkbox and struck-through title per
  ADR-0006, and clicks route through uncancel, consistent with the
  Logbook.
- **logbook**: Settled date renders in theme color instead of the
  scheduled date chip (#89) — planned-date chips no longer leak into
  settled rows, settled tasks are exempt from the overdue exception
  that force-rendered a red chip, and the settled date renders at
  the row-leading chip position in the theme primary color for both
  task and project rows.

## [0.5.1] - 2026-09-25

### Added

- **ui**: Grouped View for the time views (#81) — Today/Anytime/Someday
  tasks now group under their direct parent (project/area) with
  collapsible group headers (chevron, progress ring, badges, counts)
  following sidebar order; loose tasks float at the top and orphaned
  tasks (settled/trashed/missing parents) stay ungrouped with their
  parent tag. Grouping is a pure render-layer derivation over the
  unchanged flat feed. Collapse state persists device-locally per view
  per parent (never synced); within-group reorder writes back the
  global Position, cross-group drop reassigns projectId/areaId, and
  dropping on a collapsed group lands at its end with a confirming
  toast. Keyboard support follows ADR-0004: ←/→ collapse/expand
  headers, j/k traverse visible rows only, Alt+↑/↓ clamp at group
  boundaries, Space on a header creates the task in that parent.
  Settings → General gains a synced "group tasks by project/area in
  time views" toggle (default on), and the General tab now renders on
  web too.
- **logbook**: Logbook redesigned after Things 3 (#82) —
  progressive-granularity groups replace the flat
  today/yesterday/earlier buckets: today/yesterday as relative labels,
  the current week as full weekday names, earlier full weeks of this
  month as week ranges, then earlier months of the year, then years —
  a bounded group count keeps long history scannable. Settled dates
  render inline next to the title on both task and project rows (with
  year when crossing years), and cancelled project rows render
  consistently (X progress ring, struck-through dimmed title) —
  presentational only, per ADR-0006.
- **ui**: Notes & subtasks badges on collapsed task rows (#71, #79) —
  a sticky-note icon when notes are present and a list icon with the
  open-subtask count, pinned in the title cluster next to the title
  (Things 3 style) and hidden when empty.

### Changed

- **ui**: Things 3-style date display on task rows (#78) — the
  scheduled date moves from a trailing calendar-icon badge to a
  leading date chip between checkbox and title (rounded muted capsule
  with a short absolute date, red when overdue/today); the Today view
  omits the chip since the list itself is the date context, but
  overdue tasks keep a red chip. The repeat-rule icon moves to the
  leading slot next to the chip. The deadline badge switches from a
  Clock icon with an absolute date to a Flag icon with a countdown
  ("x days left" / red "today" / red "x days past due"), so the text
  format itself distinguishes plan-to-start from must-finish; project
  meta rows follow the same flag + countdown style, and CONTEXT.md
  gains a Deadline entry recording the distinction.
- **ui**: Project/area reassignment consolidates into a "Move" entry
  in the task context menu (#75) — the Project and Area icon buttons
  leave the expanded task row; the move picker lists areas and
  projects side by side in one panel, with a "None" row per section
  to clear the assignment.

### Fixes

- **mobile/desktop**: Cold start no longer blocks on session refresh
  (#73) — boot awaited the `/auth/refresh` server round-trip (up to
  the 15s timeout on weak networks) before resolving, stacking a
  network wait on top of the WebView cold start even though the
  local-first replica already has everything needed to render. With a
  persisted user snapshot and hydrated session, boot now resolves
  immediately and refresh runs in the background (401 still clears
  the session and switches to login; network failures fall back to
  offline mode with the sync indicator). Both shells share the same
  startup semantics, with boot tests added per shell.
- **backend**: Parse `repeatRule` in change event payloads (#80) —
  `buildPayload` passed the raw Prisma row through for task events,
  leaving `repeatRule` as a TEXT JSON string instead of the parsed
  object every other read path returns; the SSE event then overwrote
  the client's task cache with the string, so the repeat rule editor
  bounced the toggle off and disabled all controls. The event payload
  now mirrors the HTTP read path, locked by an integration regression
  test.
- **ui**: Cancelled tasks render with an X checkbox mirroring the
  completed style (#76) — filled shape with an X instead of a
  checkmark, muted tones, and the pop animation; the old outlined
  circle-slash was visually indistinguishable from the unchecked
  state at 18px.
- **ui**: Fix calendar size and selected/hover styles (#74) —
  react-day-picker v10 applies modifier classes (selected/today/
  outside/disabled) to the outer `td` rather than the day button, so
  the round selected background rendered as a skewed rounded
  rectangle layered over the button's own hover background. A custom
  DayButton now carries the visual states on the button itself, the
  today dot anchors to the button, and the calendar shrinks one notch
  (day buttons size-9 → size-8, mobile size-10 → size-9, still ≥36px
  touch targets).
- **ui**: Show reminder & repeat rule sections in the task context
  menu date picker (#70, #72) — the context menu's ScheduledDateField
  was opened with default props that hid the reminder time and repeat
  rule sections the expanded task row shows; the repeat rule editor
  was extracted into a standalone field entry so both entry points
  render the full editor.
- **ui**: Keep task rows rounded while the selection fades out (#77)
  — `rounded-lg` was only applied in the selected/expanded states, so
  the corner radius vanished instantly when a row switched back to
  idle while the background kept fading for ~150ms, briefly flashing
  a square-tinted block; the radius is now always present.

## [0.5.0] - 2026-09-23

### Added

- **recurring-tasks**: Repeating Tasks — attach a Repeat Rule to a
  scheduled Task (unit day/week/month/year × interval N, optional weekday
  pattern for week rules, "after completion" anchor option, optional
  `until` end date). Completing a repeating Task immediately derives the
  next occurrence: a plain Task carrying the same rule, landing in
  Upcoming (future) or Today (overdue), with title/notes/tags/reminder/
  placement copied and subtasks reset to active. Multi-device concurrent
  completion converges on exactly one next instance via deterministic id
  derivation (`hash(parentTaskId, canonicalRule, occurrenceDate)`,
  ADR-0012) — the sync hub stays a dumb merger with zero business-logic
  changes. Rule edits fork the chain by design; cancelling ends it;
  moving to Someday/None clears the rule; settling keeps it for Logbook
  provenance; un-completing deletes the derived instance. The rule
  editor lives in the scheduling popover (visible only for date-
  scheduled Tasks, never Projects) with a live "next occurrence"
  preview; Task rows show a ↻ badge. Web clients get the same editor
  with server-side derivation on the REST complete path.
- **reminders**: Task reminder times — set a time-of-day (HH:mm)
  reminder in the scheduling popover while a Task is scheduled to a
  date. Desktop fires the notification from a runtime scheduler while
  the app is running (missed ones are silently dropped, never replayed);
  mobile registers system-level scheduled notifications via
  `tauri-plugin-notification` that fire even when the app is closed.
  Reminder data is a new `reminderTime` field on Task that syncs through
  the existing field-level HLC last-write-wins merge; Projects do not
  support reminders. Reminders are cleared automatically when a Task is
  settled (completed/cancelled), trashed, or moves off a scheduled date;
  moving to another date keeps the reminder time. Permission is
  requested on first reminder enable (not app launch); if denied, the
  time can still be saved with an in-popover notice and a jump to
  system notification settings. Task rows show a clock + HH:mm badge,
  and the web frontend hides the reminder section entirely this version.

## [0.4.6] - 2026-09-22

### Added

- **mobile**: Android app (#63) — the third thin shell alongside
  web/desktop (ADR-0010): a Tauri v2 app reusing `@taskora/ui` pages and
  the `@taskora/engine` local replica. Full parity — Areas / Projects /
  Tasks / Tags / Buckets / calendar / search, offline capture with the
  full local replica, foreground sync (startup pull, post-write push,
  foreground-resume pull, pull-to-refresh), the Android back-gesture
  cascade (overlay → history back → app exit), keyboard avoidance, and
  system-bar insets handling with theme-matched strips. Login tokens are
  stored as plaintext JSON in the app-private directory (ADR-0011 — the
  ADR-0009 Keystore JNI bridge crashed on real-device login and was
  removed; the Linux sandbox still shields unrooted devices).
  Distribution: signed arm64-only APK published to GitHub Releases on
  `v*` tags (`android-release.yml`, signing setup in
  `scripts/android-signing.py`); sideload instructions in the README
  (bilingual). Version carriers (package.json / tauri.conf.json /
  Cargo.toml) bumped with the monorepo via `release.mjs`.
- **api**: `ClientKind: 'mobile'` (X-Client header) — the backend
  refresh flow accepts mobile alongside desktop for the body-based
  refresh-token exchange (`isNonCookieClient`).

## [0.4.5] - 2026-09-21

### Added

- **ui**: Hover hints on the expanded task row's field icon buttons
  (date, due, project, area, tags) (#57): sibling buttons (add/delete
  subtask) already had tooltips while the five field triggers showed
  none. The IconPopover trigger is now wrapped in `Hint` inside
  `TaskRowExpanded`, with the label sourced from the same i18n key as
  the button's `aria-label`; Radix Tooltip closes its content on
  trigger click/pointerdown, so the hint does not linger behind the
  opened popover.

### Changed

- **deps**: Pin TypeScript to 5.9.3 via `pnpm-workspace.yaml` overrides
  (#55): i18next v26 declares typescript as an optional peer, and the
  lockfile resolved typescript 5.8.2 for `packages/frontend` but 5.9.3
  for `packages/api` and friends, so pnpm created two distinct
  peer-variant copies of i18next/react-i18next — `@taskora/api`
  initialized one copy while `Login.tsx`'s `useTranslation()` read from
  the other (uninitialized) copy, rendering raw keys ("auth:login") on
  the web/desktop login pages. A Login i18n smoke test now fails when
  raw keys are rendered.
- **ci**: Align CI's pnpm with the lockfile-generating pnpm 11 (#55):
  CI installed pnpm 9, which does not read overrides from
  `pnpm-workspace.yaml`, so it saw an empty overrides config that
  mismatched the lockfile's recorded override and failed with
  `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` on `--frozen-lockfile`. A
  `packageManager` field (pnpm@11.17.0) is now the single source of
  truth and the hardcoded `version: 9` was dropped from the workflows
  so `pnpm/action-setup` reads the version from package.json.

### Fixes

- **ui**: Touch support for row context menus, drag reorder, and
  agent/calendar layout (#56): row context menus (task/project/subtask)
  were mouse-only (`onContextMenu`), so touch devices could not delete,
  cancel, move, or restore rows — a `useLongPress` hook (touch/pen only,
  500ms hold, 8px tolerance, click suppression after firing) now opens
  them via a shared `openMenuAt(x, y)` virtual-anchor path. The
  `/agent` (full-bleed) and `/calendar` (canvas) `h-full` containers
  were occluded by the fixed MobileTabBar on small screens —
  `MainContent` gains `max-md` bottom padding (3.5rem + safe-area
  inset). Drag reorder used `PointerSensor(distance: 5)`, so touch
  scrolling 5px hijacked the list into a drag and the heading drag
  handle was hover-only (invisible on touch) — five DndContexts
  (TaskList, FeedListView, AreaDetail, ProjectTaskLayout,
  SidebarProjectSection) switch to `MouseSensor(distance: 5)` +
  `TouchSensor(delay: 300, tolerance: 8)`, and the heading handle is
  visible with `max-md:opacity-100`.
- **ui/desktop**: Restore title auto-focus when creating projects,
  areas, and tasks (#58): creating a new project/area while already on
  another detail page left the title as a static `<h1>` instead of the
  auto-focused empty input — the route change only swaps params, React
  Router reuses the page component, and `InlineTitleEdit`'s
  `useState(autoFocusAndSelect)` initializer never re-runs; it now
  enters edit mode when `autoFocusAndSelect` turns true while mounted
  (mirroring `ProjectHeadingRow`), covered by a desktop-shell test
  (MemoryRouter + Suspense + lazy pages, StrictMode, engine cache
  replacement). Additionally, creating a task on the project/area page
  left the expanded row's title input unfocused: `useCreateTask`
  invalidated and replaced the optimistic temp row before the mutation
  resolved, then `onSuccess` blindly prepended the real row again —
  React's dedupe reconciliation unmounted the focused expanded row;
  the create `onSuccess` now dedupes against concurrent cache updates.
- **ui**: Clamp long sidebar titles instead of spilling past the panel
  (#60): Radix ScrollArea's viewport wraps content in a shrink-to-fit
  `display: table` div, so a long project title's min-content inflated
  the wrapper (~721px), pushed past the viewport, and got hard-clipped
  without ellipsis — the shared ui ScrollArea overrides the wrapper
  back to `display: block`. SidebarAreaRow / CollapsibleSection title
  NavLinks were flex items with `min-width: auto`, forcing rows wider
  than the sidebar — they gain `min-w-0` so the inner truncate span
  measures correctly (verified with a vite+playwright geometry harness:
  53 overflowing elements before, 0 after).
- **ui/desktop**: Tame sidebar auto-scroll so edge-zone project drags
  land correctly (#59): sidebar project drags inside the Radix
  ScrollArea ran away whenever the dragged item sat in the bottom 20%
  of the scroll viewport — dnd-kit's default autoScroll (20% threshold,
  5ms interval, acceleration 10) spun the list at ~2000px/s, sweeping
  the placeholder through the whole column and committing the drop to
  a neighboring area or the list end. The edge threshold narrows to one
  row (~6%), the scroll slows (acceleration 4, interval 20ms) so edge
  drags keep a gentle auto-scroll, and the parameters are locked with a
  regression assertion.
- **ui**: Save and collapse task on plain Enter in the title input
  (#61): pressing Enter while focused on an expanded task's title input
  previously only blurred it to commit the edit, requiring a second
  Enter after focus returned to the row to collapse — the plain-Enter
  path now merges with the Cmd/Ctrl+Enter path so both blur to commit,
  hand focus back to the row, and collapse the expansion in one step.

## [0.4.4] - 2026-09-21

### Fixes

- **api**: Add the missing `getFeed` to the REST task backend — the web
  feed rendered "load failed" (#53): the feed query hook calls
  `currentTaskBackend().getFeed(view)`, but the REST module (the default
  backend on web) never implemented it; the `TaskBackend` interface was
  satisfied via an unchecked `rest as TaskBackend` cast, so the gap only
  surfaced at runtime as `getFeed is not a function` → react-query
  `isError` → "加载失败". `getFeed(view)` now calls the existing
  `GET /feed?view=...` endpoint, and the `as TaskBackend` casts are
  replaced with structural assignment so future missing members fail at
  compile time.
- **sync**: Dual-write position/sortOrder in every reorder path (#54):
  desktop drag-reorder inside a project silently bounced back while the
  web client showed the new order, because the two surfaces read
  different sort keys (replica: fractional-indexing `position`; web:
  `sortOrder asc, createdAt desc`), and once a device wrote a real
  position a reorder touching only `sortOrder` stopped affecting the
  desktop (the mirror bug froze the web for position-only writes).
  `synthPosition` moved into `@taskora/engine` so written and
  synthesized positions never diverge; `positionAfter` falls back to
  synthesizing from `sortOrder`+`createdAt` instead of "insert at
  front" when a neighbor has no position; engine backends and the REST
  reorder endpoints (tasks/projects/project-headings) now write both
  keys in the same transaction.
- **sync**: Poison-pill defense, completed compact cascades (#54): a
  device writing offline could reference an entity physically deleted
  (compacted) elsewhere — the hub's merge hit a foreign-key violation,
  failed the whole push batch, and the device replayed the same poison
  batch forever (stuck at "offline, N pending"). The hub now scrubs
  dangling references before merge (array refs drop dead ids, scalar
  refs null out per compact `SetNull` semantics, a dead subtask drops
  the whole event) with a three-state alive/dead/pending probe that
  preserves forward references within the same batch; scrubbed values
  carry a virtual-device-0 clock that wins over the pushing device's
  HLC so the echo actually applies. Tag compaction scrubs `tagIds` in
  replicas as well as hub relation rows; `removeRows` reports every
  affected entity (cascade children, SetNull hosts, `tagIds` hosts) so
  UI caches invalidate correctly; `DELETE_CASCADES` gains
  project → project-heading, `COMPACT_NULL_REFS` gains
  project → task.projectId, and the hub broadcasts cascaded compacts
  per entity (emptyTrash registers and broadcasts heading compacts —
  orphan headings no longer survive forever).
- **sync/desktop**: Keep the local-first desktop app usable offline
  after restart (#54): boot's `refresh()` failure previously surfaced a
  retry screen instead of the main window, and without a hydrated user
  there was no `userId` to open the per-user replica — offline only
  worked within a running session. Boot now mirrors a
  preferences-free user snapshot to WebView storage (tokens stay in the
  secure store) and, on network failure with a snapshot available,
  keeps the hydrated user and starts offline (the sync indicator shows
  offline state); 401 still signs out and a no-snapshot first-run keeps
  the retry screen. `syncNow` reports success, and a first sync failing
  on an empty replica (cursor 0) retries with 2s→15s backoff until the
  bootstrap lands instead of rendering empty data.
- **sync**: Align remaining replica semantics with REST (#54):
  `updateTask` clears `headingId` when `projectId` changes (a task
  moved to another project previously reappeared under the old
  project's heading when moved back); `restoreProject` (both surfaces)
  only revives tasks trashed by the project cascade (same `trashedAt`
  timestamp), leaving independently deleted tasks in the trash;
  `getProjectHeadings` sorts ties by `createdAt asc` matching
  `ProjectHeadingsService`; `useReorderTasks` optimistic update only
  reorders lists fully covered by the submitted ids.

## [0.4.3] - 2026-09-20

### Fixes

- **sync**: Make a device's own echo idempotent — no more UI flash
  after "create task syncs": `SyncHubService.applyEvent` stored
  `fieldDigests` computed from the _pushed_ wire values, while the
  persisted columns diverge from them (`updatedAt` override,
  non-nullable columns taking Prisma defaults such as `sortOrder`
  null → 0, `tagIds` read back sorted from the relation table).
  `serializeRow`'s digest check therefore misread the hub's own merge
  write as a REST bypass and reset the field clocks to virtual device 0
  at the row's `updatedAt` — the device then pulled its own echo back
  with _newer_ clocks, applied it, fired `onChange`, and invalidated
  every query root (the "refresh flash" ~1s after creating a task).
  Digests are now backfilled from the row's wire view after the merge
  write (with an explicit `updatedAt` so `@updatedAt` cannot bump it),
  `updatedAt` is only synthesized when the patch omits it (device
  values persist verbatim, so tied-clock echoes no longer diverge),
  and the device replica normalizes `sortOrder`/`tagIds` writes to the
  same persisted-column semantics. The in-memory test hub now models
  the same normalization, with echo-idempotency regression tests at
  both the harness and real-Postgres seams.
- **desktop**: While the local-first Engine is active, the Event Stream
  (SSE) is now purely a "something changed, pull now" trigger: the
  legacy cache-surgery applier is disabled (it double-invalidated on
  every echo and reordered lists by the REST-era `sortOrder`/
  `createdAt` authority, fighting the replica's `Position` ordering);
  it is re-enabled when the engine stops or fails to assemble (REST
  fallback). Engine change notifications now carry origin + entities,
  so the desktop invalidates only the affected query roots and only
  local writes schedule the debounced sync (applying remote changes no
  longer chains a pointless flush/pull).
- **ui**: `useCreateTask` optimistic insert now prepends, matching both
  backends' newest-first list semantics (REST: `createdAt desc`;
  Engine: head `Position`) — the real task no longer jumps from the
  bottom to the top of the list after refetch.

## [0.4.2] - 2026-09-20

### Fixes

- **sync**: Reject nothing on sync push — repair `PushRequestDto`
  validation (#49): the global ValidationPipe (whitelist +
  forbidNonWhitelisted) rejected every legal `POST /sync/push` request
  with 400 — `OutboxEventDto.fields` was mislabeled `@IsArray()` although
  fields is a Record (field name → `{ value, hlc }`), and
  `PushRequestDto`'s nested arrays lacked `@Type`, so class-validator
  could not resolve the nested metatypes. The desktop client therefore
  never managed to flush its Outbox, showing a permanent
  "offline · N pending" status despite healthy network and server
  (login/pull/bootstrap were unaffected). `fields` is now typed
  `@IsObject()` reusing `OutboxEvent['fields']` from `@taskora/engine`
  so DTO and protocol stay a single source of truth, nested arrays
  carry `@Type(() => OutboxEventDto)` / `@Type(() => DeleteRequestDto)`,
  and a regression test runs the real pipe config against a genuine
  engine payload.

## [0.4.1] - 2026-09-20

### Fixes

- **desktop**: Restore startup session recovery on v0.4.0: Tauri's
  `Builder::setup` and `Builder::invoke_handler` have replace semantics,
  so the `sqlite::install(builder)` call added in #48 silently discarded
  the tray setup and the `session_read` / `session_write` command
  registrations — `invoke('session_read')` rejected at startup and the
  app showed "session restore failed" forever (both retry and clear hit
  the same missing command, leaving session.dpapi untouched; the tray
  was also lost, so a hidden main window was reachable only by
  relaunching). Registration is now a single point: `sqlite.rs` gains
  `manage_state(app)` called from lib.rs's single setup, and one
  `invoke_handler` registers all six IPC commands. Linux CI compiled
  fine because the override only manifests at runtime.

## [0.4.0] - 2026-09-20

### Added

- **sync**: Local-first sync engine with Sync Hub and SQLite replica
  (#46, ADR 0007): a new `@taskora/engine` package provides the HLC
  hybrid logical clock, fractional-indexing positions, a field-level LWW
  merger shared by device and hub, and a reactive SQLite LocalReplica
  whose local writes enter an Outbox (pending edits survive restarts
  and merge on sync); the backend runs a Sync Hub (device registry,
  `POST /sync/devices`, `POST /sync/push`, `GET /sync/pull`,
  `GET /sync/bootstrap`) where REST and Assistant writes enter the same
  merge stream as virtual device 0, with field digests so REST writes
  never collateral-drop concurrent device edits on other fields; the
  desktop client runs Inbox/Today task CRUD on the engine.
- **desktop**: Full offline via delete requests and domain backends
  (#47, ADR 0008): a Delete Request primitive queues deletions in the
  Outbox with compact-wins convergence and local cascade cleanup;
  per-domain Engine backends (task, subtask, project, area, tag, tag
  group, project heading) replace REST calls after login (REST
  fallback on logout/failure) so every desktop entity works offline;
  quick-add relays through the main window's engine, and a sync-status
  store drives a SyncIndicator (synced / syncing / offline with
  pending count).
- **desktop**: System tray with Show Taskora / New Task / Quit entries:
  closing the main window now hides to the tray on every platform
  instead of exiting on Windows/Linux, so the global quick-add
  shortcut keeps working; re-open via tray, Dock icon or a second
  launch, exit via the tray's Quit entry.
- **desktop**: Main-window size and position are remembered across
  launches (tauri-plugin-window-state, quick-add denylisted, visibility
  not restored so fresh starts always show the window).

### Changed

- **desktop**: The Local Replica SQLite database is now per-user
  (`taskora-<userId>.db`) instead of a single shared `taskora.db`:
  switching accounts no longer leaks the previous account's sync
  cursor and queued Outbox edits. The legacy single-user database is
  migrated once (copied) for the first account that signs in and then
  renamed to `taskora.db.legacy`; other accounts start from a fresh
  replica.

### Fixes

- **desktop**: Stop the stale-query refetch on WebView resume from
  reintroducing the foreground flash (#45): `refetchOnReconnect` is now
  disabled in the desktop and frontend query clients — the Tauri
  WebView resume fired the browser `online` event and refetched every
  stale query, recreating the loading-state flash; the SSE reconnect
  with `?since=` replay, gap detection and resync signal remain the
  backstop.

## [0.3.6] - 2026-09-19

### Changed

- **desktop**: Drop the custom-drawn title bar and return to native
  window decorations. Removes `TitleBar.tsx` (drag region +
  Windows/Linux min/max/close buttons + macOS traffic-light inset),
  the in-flow shell wrapper and its `--titlebar-h` / `height: 100%`
  CSS compensations, and the `titleBarStyle: Overlay` +
  `set_decorations(false)` setup; the main window now shows the
  platform-native title bar and the shared `h-dvh` layout works
  unmodified, same as the web app. Quick-add remains a borderless
  popup, and the window capability list is trimmed to what the
  frontend still invokes.

## [0.3.5] - 2026-09-19

### Fixes

- **desktop**: Rework the custom title bar into an in-flow shell layout
  (#43): the title bar was a fixed overlay (top-0 z-50) while the shared
  AppShell still laid out from y=0, so the first 38px of the main view sat
  under the bar, blurred by the backdrop with clicks swallowed by the drag
  region; the old CSS calc(100dvh - titlebar) compensation never pushed
  content down. The desktop entry now wraps TitleBar + App in a flex
  column (h-dvh + flex-1), the bar becomes a normal flow header, shared
  layouts fill their parent (height: 100%) instead of the raw viewport,
  and Toaster gets a top offset so toasts drop below the bar. macOS
  (Overlay style + 78px traffic-light inset) and the quick-add window are
  unchanged.

## [0.3.4] - 2026-09-19

### Features

- **tasks**: Add the CANCELLED terminal state with a single settledAt
  column (#42, ADR 0006): the physical completedAt column is renamed to
  settledAt (zero data migration) while the API field keeps the
  completedAt name carrying Settled At semantics; symmetric
  cancel/uncancel endpoints for tasks and subtasks; terminal states
  rewrite each other directly and reopen returns to ACTIVE; Logbook
  and the project completed panel list both endings; keyboard parity
  with complete (Opt+Cmd+K / Ctrl+Alt+K / Alt+Shift+K) plus context-menu
  entries and slashed-circle struck-through rendering for cancelled
  rows; the settled-status whitelist lives in @taskora/shared so the
  backend and frontend ports cannot drift; restore from trash always
  returns a task to ACTIVE.
- **sync**: Per-user Event Stream push sync (ADR 0005) (#38): a Prisma
  interceptor collects change events per transaction and a per-user
  ChangeEventHub (monotonic seq, 500-event replay ring) serves them over
  GET /events SSE with ?since= replay, 25s heartbeat and a resync signal;
  the client applies events directly onto the React Query cache through
  a client-side port of the task view/filter semantics (detail merges,
  derived-cache invalidation, ~50ms coalescing), reconnects with backoff
  and gap detection, and refreshes on 401; refetchOnWindowFocus is off
  in frontend and desktop, removing the foreground flash.
- **backend**: Exclude projects from the inbox and anytime feeds (#41):
  resolveBucket falls back to ANYTIME instead of INBOX, the schema
  default changes to ANYTIME with a data migration, projects only
  surface in today/upcoming/someday/logbook/trash, and the agent
  update_project tool no longer accepts the INBOX bucket.
- **ui**: Calendar-based due date picker with single-click selection
  (#37): DueDateField now uses the shared Calendar (react-day-picker)
  with Today/Clear quick actions, locale and weekStartsOn support,
  auto-closing on apply at every call site; shared calendarFieldUtils
  drops the duplication with ScheduledDateField and the Calendar
  styling gets a pill-shaped selected day and clearer today marker.
- **ui**: Show inbox and today item counts in navigation (#40): pill
  badge on the mobile tab bar (capped at 99+) and Things-style count at
  the end of the sidebar rows, derived from existing feed queries with
  no extra requests.
- **ui**: Project metadata badges in the project detail header (#36):
  a ProjectMetaRow renders scheduled date, due date and tag badges
  (destructive color when overdue/today) that open popovers reusing the
  task field editors; field components move to structured prop types
  shared between Task and Project.
- **ui**: Custom scrollbars matching the Things3 theme (#39): thin
  rounded thumbs that are nearly invisible at rest and darken on
  hover/active, deriving colors from --foreground so themes adapt;
  Firefox uses scrollbar-width/scrollbar-color, Chromium/WebKit use
  ::-webkit-scrollbar with 6px visual thumbs.
- **desktop**: Custom-drawn title bar replacing the native window
  frame (#35): the main window starts hidden and is shown after
  per-platform decoration handling so no native frame flashes; macOS
  keeps the native traffic lights over an Overlay title bar with a
  drag strip; Windows/Linux draw the title plus Windows-style
  minimize/maximize/close controls in a full drag region with
  double-click maximize; layout height rebases to
  calc(100dvh - var(--titlebar-h)) in the desktop build only.
- Replace the app icon with a new design across all platforms.

## [0.3.3] - 2026-09-18

### Features

- **ui**: Icon-only buttons now reveal a Things-style hint tooltip on
  hover and keyboard focus (#34): the action label plus the
  platform-aware shortcut (⌘N / Ctrl+N / Alt+N) sourced from the keymap
  registry, so displayed keys always match the actual key bindings
  (ADR-0004). Adds a Radix-based Tooltip primitive and a `<Hint>`
  component; wired into ContentBottomBar, SidebarBottomBar settings,
  Calendar prev/next, Agent new-conversation/chat send, and
  TaskRowExpanded add/delete-subtask buttons (menu triggers skipped to
  avoid tooltip/menu visual collision).

### Fixes

- **keyboard**: Make DOM focus follow selection with roving tabindex
  (#33): keyboard navigation previously moved the highlight but left DOM
  focus on the originally clicked row, showing a stray native
  :focus-visible outline. Only the selected row is a tab stop;
  KeyboardShortcuts moves DOM focus after every selection change;
  sidebar project rows keep plain tab order; creating a task/heading
  moves focus to the new row.
- **ui**: Notes editor shows a text cursor and accepts clicks across its
  full height (#32) — the min-height now sits on the editable
  `.ProseMirror` element, so the blank area below the first line is
  clickable (frontend and desktop stylesheets).

## [0.3.2] - 2026-09-18

### Features

- **keyboard**: Things3-aligned keyboard shortcuts P0 (#28): a global
  keymap registry (ADR-0004) with a single window-level keydown listener,
  a cross-page selection model covering the 8 bucket pages plus
  project/area/tag detail pages, Cmd/Ctrl/Alt+1..6 bucket jumps, arrow-key
  navigation, Cmd/Ctrl+A select-all with batch complete/delete,
  Cmd/Ctrl+K complete, Backspace/Delete trash (restore in Trash),
  Space/Enter/Esc inline expand-edit, Space new task below selection,
  Cmd/Ctrl+F search and new-task/new-project/new-heading shortcuts.
  Quick Add is now Cmd/Ctrl+Shift+Space to avoid IME and Spotlight
  conflicts.

### Fixes

- **auth**: Harden the token lifecycle (#31): revoke all refresh tokens on
  password change (re-issuing one fresh token for the current session),
  revoke the refresh token on logout even when the access token has
  expired, and serialize web refresh across tabs with Web Locks so two
  tabs hitting 401 simultaneously no longer trip refresh-token reuse
  detection and log every tab out.
- **auth**: Show error feedback on web login/register failures (401/409/400
  inline messages, client-side 8-char minimum) and a success notice after
  redirecting to login post-register (#31).
- **auth,keyboard**: Wire the web auth-flow navigation adapters in
  main.tsx so afterLogin/afterRegister/onLoggedOut redirects actually
  happen; logout now navigates to /login (#30).
- **keyboard**: Enter expand now toggles (matching the click cycle), the
  native-button escape-hatch no longer swallows Enter/Space on
  role="button" rows, and the task created below a selection is selected
  so delete/complete act on it (#30).
- **ui**: Stop the "Note…" placeholder from overlaying existing notes —
  with `immediatelyRender: false` the editor-state selector kept reporting
  `isEmpty` before the first transaction; affects task and project notes
  (#29).

## [0.3.1] - 2026-09-17

### Changed

- **release**: 统一桌面端与 Web/后端的版本号（desktop 0.2.0 → 0.3.1 对齐），
  双轨制改为单轨：`pnpm release <x.y.z>` 一次 bump 全部包与 Tauri 三件套，
  `v*` tag 同时触发镜像发布（`release.yml`）与三平台桌面打包
  （`desktop-release.yml`），不再使用 `desktop-v*` tag。历史双轨小节保留。

## [0.3.0] - 2026-09-16

### Features

- **agent**: Conversational Assistant V1 (#22). A backend `agent` module runs
  @earendil-works/pi-agent-core with @earendil-works/pi-ai: per-conversation
  agent pool rebuilt from persisted messages, BYOK provider config
  (AES-256-GCM encrypted, connectivity test endpoint), tools wrapping
  existing services scoped by user, and a beforeToolCall approval flow with
  10-minute expiry. Conversations and messages persist across restarts; an
  SSE endpoint streams message updates, tool executions and approvals.
- **ui**: `/agent` chat view shared by web and desktop — conversation list,
  streaming message bubbles, tool and approval cards — plus an Assistant
  settings tab with provider presets ([OI]/DeepSeek/OpenRouter/Ollama/custom).
  Requires the `AGENT_ENCRYPTION_KEY` env var on the backend.

### Fixes

- **frontend**: Restore the user after a full page reload (#21). Startup now
  fetches `/auth/me` when only the token survived the reload, and
  ProtectedRoute waits during recovery instead of flashing an unauthenticated
  UI.

### Refactors

- **ui**: Group logbook and trash between the main navigation and areas in
  the sidebar (#20).

---

## Desktop [0.2.0] - 2026-09-16

### Features

- **agent**: Conversational Assistant in the desktop client (#22): the shared
  `/agent` chat view (streaming bubbles, tool and approval cards) and the
  Assistant settings tab with BYOK provider presets. Requires backend v0.3.0
  or newer and a configured `AGENT_ENCRYPTION_KEY`.

### Fixes

- **frontend**: Restore the user after a full page reload (#21).

### Refactors

- **ui**: Group logbook and trash between the main navigation and areas in
  the sidebar (#20).

---

## Desktop [0.1.2] - 2026-09-15

### Fixes

- **desktop**: Require a 2xx response from the backend health probe before
  saving the server URL in server setup. A typo pointing at an unrelated
  host (or a path that 404s) was previously accepted silently and only
  surfaced later as failing API calls; the form now reports an unreachable
  server up front. Depends on the unauthenticated `/api/v1/health` endpoint
  shipped with the v0.2.1 backend.
- **ui**: Stop nesting buttons inside the project row button (React
  `validateDOMNesting` warning); row navigation now uses a `role="button"`
  div with Enter/Space activation, and Space on the progress ring toggles
  completion without navigating.

---

## [0.2.2] - 2026-09-15

### Fixes

- **frontend**: Restore the web UI styling. The Tailwind `content` globs
  still pointed at `./src` after 0.2.1 moved every component and page into
  `@taskora/ui`, so the built stylesheet shipped almost no utility classes
  and the deployed app rendered as unstyled text. `../ui/src/**/*.{ts,tsx}`
  is now scanned, as it already was for the desktop client.

---

## [0.2.1] - 2026-09-15

### Features

- **monorepo**: Extract the `@taskora/api` and `@taskora/ui` packages so the
  web and desktop clients share one data layer and component set (#16).
- **settings**: Show the real per-client version in Settings → About instead
  of a hardcoded value (#17).

### Fixes

- **backend**: Support the desktop refresh flow — `POST /auth/login`,
  `/auth/refresh` and `/auth/logout` now accept and return the rotating
  refresh token in the request body when the client sends `X-Client: desktop`.
  Non-cookie clients (the Tauri webview) could never hold the `SameSite` `rt`
  cookie, so every restart ended in a forced re-login (#18). Requires desktop
  client 0.1.1 or newer.
- **backend**: Add an unauthenticated `/api/v1/health` liveness probe for
  clients and container healthchecks.
- **ui**: Stop nesting buttons inside the project row button.
- **frontend**: Make the sidebar hover highlight instant on enter (#15).

---

## Desktop [0.1.1] - 2026-09-15

### Fixes

- **desktop (0.1.1 re-release)**: Store Windows sessions in a per-user
  DPAPI-encrypted local file, migrate legacy credentials, and wait for
  the complete token pair to be saved before completing login.
- **desktop**: Restore sessions once at startup, coordinate token rotation
  across windows, and retain credentials on network/timeout/server errors.
  Session recovery errors now offer retry or explicit local-session reset.
- **desktop**: Keep sessions signed in across restarts via a body-based
  refresh-token flow stored in the OS keychain (#18). Requires backend
  and desktop to be deployed together.
- **ui**: Show the per-client version in Settings → About instead of a
  hardcoded value (#17).

---

## [0.2.0] - 2026-09-05

### Features

- **calendar**: Add calendar view with month/week grids keyed by dueDate (#11).
- **calendar**: Optimize calendar to a full-width month view (#12).
- **frontend**: Mobile responsive layout with bottom tab bar (#14).

### Fixes

- **frontend**: Unify preference storage with normalization and rollback (#13).
- **frontend**: Remove residual focus ring on task title edit input.

---

## [0.1.6] - 2026-08-28

### Features

- **frontend**: Refresh UI with the Soft Studio visual system (#10).
- **upcoming**: Refine layout with month labels and empty-day spacing (#9).
- **frontend**: Replace favicon with the project icon.

---

## [0.1.5] - 2026-08-10

### Features

- **notes**: Add a markdown WYSIWYG editor (Tiptap) for task and project notes.
- **project-headings**: Add archive/unarchive with cascade-complete.
- **project-headings**: Improve cross-group task drag feedback with a drag preview.
- **project-headings**: Preserve layout and restore in-place edit in the completed panel.
- **sidebar**: Improve project drag feedback.

### Fixes

- **project-headings**: Remove misleading empty-state text under archived headings.
- **project-headings**: Align outside drops with the drag preview.
- **project-headings**: Allow trashed project headings to load.
- **project**: Allow trashed project detail page to open and edit.
- **project**: Tighten ProjectItem vertical padding from py-2.5 to py-1.5.

---

## [0.1.4] - 2026-08-08

### Features

- **settings**: Refactor settings center from a full-page route into a popup
  modal — settings no longer navigates away from the current view.
- **settings**: Overhaul settings center with preference persistence (theme,
  language, week-starts-on synced to backend).
- **frontend**: Unify menu visuals with icons, grouping, and destructive hover
  styles across task, project, and area context menus.
- **frontend**: Collapsible completed-tasks panel on project detail page.
- **frontend**: Project progress ring checkbox replacing the folder icon,
  showing task completion ratio with click-to-complete.
- **frontend**: Calendar date picker for the scheduled-date field (react-day-picker
  based, with today / someday / clear actions).
- **frontend**: Unify subtask row styling with the rest of the app.
- **frontend**: Hide subtask section when a task has no subtasks; hide the
  add-subtask button when subtasks already exist.

### Fixes

- **settings**: Stabilize modal height with a fixed-height scrollable content
  area so switching tabs no longer causes the modal to resize.
- **settings**: Widen settings modal from `max-w-2xl` to `max-w-3xl`.
- **frontend**: Remove hover ring on project progress ring to avoid a double
  circle.
- **frontend**: Progress ring updates, detail page, and full-ring state.
- **frontend**: Close scheduled-date popover after selecting a date.

### Refactors

- **frontend**: Remove skeleton loading design in favor of simpler loading
  states.

### Documentation

- Update frontend specs to reflect the settings modal, completed-tasks panel,
  project UI prefs store, and removed skeleton loading.

---

## [0.1.3] - 2026-08-07

### Features

- **frontend**: Context menu for tasks (TaskContextMenu) with right-click
  actions: complete, date, due, tags, delete/restore.
- **frontend**: Context menu for projects (ProjectContextMenu) mirroring task
  context menu.
- **frontend**: Convert heading to project via context menu.
- **frontend**: Tags field multi-select popover in task/project/area menus.
- **frontend**: Shared MenuRow component for popover-based menus.

## [0.1.2] - 2026-08-06

### Features

- **frontend**: Area detail page with inline title editing and area more menu.
- **frontend**: Sidebar drag-and-drop for projects and areas (dnd-kit).
- **frontend**: Tag detail page.

## [0.1.1] - 2026-08-05

### Features

- **frontend**: Inline title editing for project and area detail pages
  (InlineTitleEdit).
- **frontend**: Project task layout with headings (grouping, drag, convert).

## [0.1.0] - 2026-07-25

### Features

- Initial GTD app: tasks, projects, areas, tags, inbox/today/upcoming/anytime/
  someday/logbook views.
- Auth (register/login/session recovery), preferences, dark mode, i18n (zh/en).
