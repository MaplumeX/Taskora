# Calendar view

## Goal

Add a dedicated calendar page (`/calendar`) that displays tasks on a month/week grid keyed by their `dueDate`, with the ability to quickly create tasks on a date.

## Confirmed Facts (from codebase)

- Task model (`packages/shared/src/dtos/task.dto.ts`): `scheduledDate` is the plan date; `dueDate` is the notification/deadline date. Calendar keys on `dueDate` per user decision.
- Frontend: React + Vite + TanStack Query + Zustand + react-router + i18next (en/zh) + shadcn/ui + Soft Studio visual system.
- Pages live in `packages/frontend/src/pages/`, routes in `src/router.tsx`, sidebar nav entries in `src/components/layout/Sidebar.tsx` (`{ to: '/today' ... }, { to: '/upcoming', icon: CalendarDays }`).
- Existing date utils in `src/lib/utils/date.ts` (`toInputDateValue`, `fromInputDateValue`, `isToday`, etc.).
- Task creation: `useCreateTask` hook (`src/lib/hooks/useTasks.ts`) with optimistic updates; `ContentBottomBar.tsx` currently hides the add-task button on `/upcoming`, `/logbook`, `/trash`.
- Backend `GET /tasks` supports only view filters (`inbox|today|upcoming|anytime|someday|trash|logbook`) via `buildTaskViewWhere` (`packages/backend/src/tasks/views.ts`); no existing query returns "all tasks with dueDate".
- Feed items (`FeedItem`) already carry `dueDate` and `status`.

## Requirements

- R1: New page at `/calendar` with sidebar navigation entry (near Upcoming).
- R2: Month view (default) and week view, switchable.
- R3: Tasks are placed on the day grid by `dueDate`; tasks without `dueDate` are not shown.
- R4: Click a day to create a task with that `dueDate` (inline quick-add).
- R5: i18n (en/zh) for all new UI strings.

## Acceptance Criteria

- [ ] `/calendar` route reachable from sidebar; active state highlights correctly.
- [ ] Month grid shows current month, navigation to prev/next month, today highlighted.
- [ ] Week view shows 7-day columns, switchable with month view.
- [ ] Tasks appear on their `dueDate` day cell (month & week views).
- [ ] Clicking a day opens quick-add; created task has `dueDate` = that day and appears in the cell.
- [ ] No new i18n missing-key warnings (en & zh parity).
- [ ] Existing tests, lint, typecheck pass.

## Out of Scope

- Drag-and-drop date rescheduling (excluded from v1 per user decision; grid components will be kept reusable for a future iteration).
- Displaying `scheduledDate`-only tasks.
- Any backend API change in v1.

## Technical Notes

- Data source: `GET /tasks` with `completed: true` (returns ACTIVE + COMPLETED, non-trashed); group client-side by local date of `dueDate`. No backend change needed.
- Completed tasks are shown struck-through alongside active ones (standard calendar UX; checkbox toggle via existing hooks).
