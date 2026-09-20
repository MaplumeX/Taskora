# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

> **注**：自 v0.3.0 起桌面端与仓库其余包统一版本号、随 `v*` tag 同步发版，
> CHANGELOG 不再单设 Desktop 小节（桌面专属改动标注 `(desktop)`）。
> 此前的 `## Desktop [x.y.z]` 小节是双轨制时期的历史记录。

## [Unreleased]

### Added

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