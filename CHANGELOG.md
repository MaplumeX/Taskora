# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

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