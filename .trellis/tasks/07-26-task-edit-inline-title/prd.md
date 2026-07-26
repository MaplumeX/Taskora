# Redesign task edit: inline title editing in expanded row

## Goal

When a task row is expanded, the title displayed in the top row becomes directly
editable, instead of showing a second separate title input inside the expanded
content area. Eliminate the duplicated title that currently appears (one read-only
`<span>` in `TaskItem` + one editable `<Input>` in `TaskRowExpanded`).

## Background

Current behavior (`packages/frontend/src/components/task/TaskItem.tsx`):

- The top row always renders a read-only `<span>{task.title}</span>`.
- When `selectionState === 'expanded'`, `<TaskRowExpanded task={task} />` renders
  below the top row.

`TaskRowExpanded.tsx` renders its own `<Input value={title}>` wired to local state
with `onBlur={commitTitle}` and Enter-to-blur behavior. An effect auto-focuses +
selects the title when the row was expanded via the "add task" flow
(`expandId === task.id && current.title === t('task:newTask')`).

Result: in expanded mode two titles are visible — the read-only span and the
input.

## Requirements

1. In expanded mode, the title shown in the `TaskItem` top row becomes an
   editable input bound to `task.title`:
   - Edits persist on blur (commit only if non-empty and changed), same as the
     current `TaskRowExpanded` input.
   - Enter commits (blur); Escape reverts to the original title and blurs.
2. Remove the title `<Input>` block from `TaskRowExpanded` so the title appears
   exactly once.
3. Preserve the "add task" auto-focus + select behavior: when the row is expanded
   via the new-task flow and the title is still the placeholder
   `t('task:newTask')`, the inline title input auto-focuses and selects its
   contents on mount.
4. Preserve all other `TaskItem` top-row elements and the rest of
   `TaskRowExpanded` behavior (notes, subtasks, icon popovers, separators).
5. In non-expanded modes (`idle`, `selected`), the title still renders read-only
   as a `<span>`.

## Acceptance Criteria

- [ ] Expanding a task shows exactly one title — an editable input in the top
      row — and no title input inside `TaskRowExpanded`.
- [ ] Editing the inline title and pressing Enter or clicking away persists the
      new title (non-empty, changed only).
- [ ] Pressing Escape while editing reverts the input to the original title.
- [ ] Creating a new task expands the row with the title input auto-focused and
      its placeholder text fully selected.
- [ ] Collapsing an expanded row shows the title read-only again.
- [ ] No regressions in checkbox, date badges, tags, project/area label, trash
      button, notes, subtasks, or icon popovers.

## Out of Scope

- Changing the selection/expand state machine in `useTaskRowSelection`.
- Redesigning the layout or styling of the expanded content beyond removing the
  duplicate title input.
- Backend changes.

## Technical Notes

- The title input state and `commitTitle` logic currently live in
  `TaskRowExpanded`. Move them up to `TaskItem` (or lift via a small shared hook)
  so the top row can render the input in expanded mode.
- The auto-focus effect (`searchParams.get('expand') === task.id && current.title
  === t('task:newTask')`) must move with the input.
- `TaskRowExpanded` keeps notes, subtasks, and icon popovers; it no longer needs
  `title`/`setTitle` state or the title `<Input>`.