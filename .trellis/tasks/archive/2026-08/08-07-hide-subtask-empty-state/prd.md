# Hide subtask section when task has no subtasks

## Goal

When an expanded task has no subtasks, the subtask block (title, empty-state text, input box) should not render by default. The user can still add the first subtask via a dedicated trigger.

## Requirements

- When `current.subtasks` is empty:
  - The subtask block (header, list, empty-state text, add-subtask input) is NOT rendered.
  - An `Add subtask` icon button appears in the icon-button row (alongside Scheduled / Due / Project / Area / Tags).
  - Clicking the `Add subtask` button reveals the subtask block with the add-subtask input auto-focused.
  - Adding the first subtask keeps the block visible.
- When `current.subtasks` is non-empty:
  - The subtask block renders by default on expand (header `Subtasks (n)` + list + add-subtask input).
  - The `Add subtask` icon button in the row acts as a collapse/expand toggle for the subtask block.
- Local UI state `subtasksOpen` controls block visibility; initial value = `subtasks.length > 0`.
- Collapsing the block when it has subtasks hides only the block, not the rest of the expanded view.
- No changes to backend, data model, or subtask mutation hooks.

## Acceptance Criteria

- [ ] Expanding a task with zero subtasks shows no subtask header, empty-state text, or input box.
- [ ] An `Add subtask` button is visible in the icon row for tasks with no subtasks.
- [ ] Clicking `Add subtask` reveals the subtask block with the input focused.
- [ ] After adding the first subtask, the block stays visible without further clicks.
- [ ] Expanding a task that already has subtasks shows the subtask block (header `Subtasks (n)`, list, input) by default.
- [ ] The `Add subtask` button toggles the subtask block open/collapsed when subtasks exist.
- [ ] No regressions: adding/completing/uncompleting/editing/deleting subtasks still works; notes and other icon popovers unaffected.
- [ ] Keyboard accessibility preserved (Space/Enter stopPropagation in inputs; checkbox toggle intact).

## Notes

- Lightweight task: PRD-only, no `design.md` / `implement.md` required.
- Scope is `packages/frontend/src/components/task/TaskRowExpanded.tsx` and its locale strings.