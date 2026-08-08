# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

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