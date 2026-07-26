# Paper container for task editor

## Goal

Give the expanded task editor (`TaskRowExpanded`) a distinct "paper" container
visual, so it reads as a floating card lifted from the list rather than a
tinted row region. Aligns with the Things3 aesthetic direction established in
commit `22fc67a`.

## Context

- Reference: Milesto `TaskEditorPaper` uses `border-radius: 12px` +
  `background: var(--editor-paper)` + `box-shadow: var(--shadow-inline)` to
  create the paper effect.
- Taskora current state: expanded row uses `bg-muted/60` background with
  `flex flex-col gap-3 px-2 pb-3 pt-1` — no border, no shadow, no rounded
  container. The editor visually melts into the list row.

## Requirements

### R1 — Paper container visual

The expanded editor root must look like a floating card:

- Rounded corners (≥ `rounded-lg`; prefer `rounded-xl` to match Milesto's 12px).
- Distinct background (use existing `bg-card` or `bg-background` token, not
  the row's `bg-muted`).
- Subtle border (`border border-border/50` or equivalent).
- Soft elevation shadow (`shadow-sm` or a custom `--shadow-inline` token).
- Inner padding to breathe (`px-3 py-2.5` or close).

### R2 — Unify with existing token system

- Reuse existing CSS variables / Tailwind tokens (`--card`, `--border`,
  `--radius`, `shadow-sm`). Do not hardcode hex colors.
- Must work in both light and dark themes (the token system already handles
  this — just use tokens).

### R3 — Scope boundary

- **Visual/CSS only.** Do not change interaction logic, data flow, mutation
  hooks, or component structure beyond what's needed for the container styling.
- The `TaskItem` collapsed row stays as-is.
- The paper effect applies to the `TaskRowExpanded` region only (the expanded
  area below the title row).

### R4 — Outer wrapper

Decide and implement one of:
- (a) Wrap `TaskRowExpanded` root `<div>` with paper classes directly, or
- (b) Wrap it in a new outer container in `TaskItem.tsx`.

Either is acceptable; pick whichever is cleaner with existing code.

## Acceptance Criteria

- [ ] Expanded task editor visually appears as a floating rounded card with
      border + shadow + distinct background.
- [ ] Collapsed task row appearance is unchanged.
- [ ] Works correctly in light and dark themes.
- [ ] No new hardcoded hex colors; uses existing design tokens.
- [ ] No interaction logic, hooks, or data flow changed.
- [ ] `pnpm typecheck` and `pnpm lint` pass.

## Notes

- Milestro reference CSS:
  `.task-inline-paper { border-radius: 12px; background: var(--editor-paper); box-shadow: var(--shadow-inline); padding: 12px 8px; }`
- Taskora `--radius` is `0.375rem` (6px); `rounded-xl` (0.75rem = 12px) matches
  Milesto's 12px exactly.
- Existing `bg-card` token = `--card` (white in light, `220 14% 13%` in dark).
