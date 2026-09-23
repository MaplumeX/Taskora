# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

> **注**：自 v0.3.0 起桌面端与仓库其余包统一版本号、随 `v*` tag 同步发版，
> CHANGELOG 不再单设 Desktop 小节（桌面专属改动标注 `(desktop)`）。
> 此前的 `## Desktop [x.y.z]` 小节是双轨制时期的历史记录。

## [Unreleased]

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
