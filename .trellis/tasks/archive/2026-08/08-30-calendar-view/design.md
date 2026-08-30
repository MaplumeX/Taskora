# Calendar View — Technical Design

## Architecture & Boundaries

Frontend-only change (no backend modification in v1).

```
packages/frontend/src/
├── pages/Calendar.tsx                       # page shell: view switch, month nav, grid
├── components/calendar/
│   ├── CalendarMonthGrid.tsx                # month grid (6×7 cells)
│   ├── CalendarWeekGrid.tsx                 # week grid (7 columns)
│   ├── CalendarDayCell.tsx                  # shared day cell: date header + task list + quick-add
│   ├── CalendarTaskRow.tsx                  # compact task row (checkbox + title)
│   └── CalendarQuickAdd.tsx                 # inline input for creating a task on a date
├── lib/utils/calendarGrid.ts                # pure layout helpers (+ .test.ts)
└── lib/hooks/useDueTasksQuery.ts            # query hook: all tasks with a dueDate
```

Wiring points in existing files:

- `src/router.tsx` — add `/calendar` route.
- `src/components/layout/Sidebar.tsx` — nav entry with `CalendarDays`… actually Upcoming already uses `CalendarDays`; use a different icon (e.g. `Calendar`) to distinguish, placed after Upcoming.
- `src/components/layout/ContentBottomBar.tsx` — decide add-task visibility on `/calendar` (v1: keep bottom-bar add hidden on `/calendar`, like `/upcoming`, because quick-add lives inside day cells; avoids double affordance).
- i18n: new keys in `locales/{en,zh}/nav.json` (`calendar`) and a new `calendar` namespace file in both languages.

## Data Flow & Contracts

### Data fetching

New hook `useDueTasksQuery()`:

```ts
// queryKey: ['tasks', { completed: true, hasDue: true }]
useTasksQuery({ completed: true, hasDue: true })
```

`TaskQuery` / `TaskQueryDto` gain an optional boolean `hasDue`. Backend `TasksService.findAll`: when no `view` is set, add `where.dueDate = { not: null }` if `hasDue` is true. This is a ~4-line additive change (DTO field + where clause), no migration, backward compatible (absent param → behavior unchanged). Counts as a minor backend touch despite "frontend-first" framing; tracked in implement.md.

Calendar page groups results client-side with a pure helper:

```ts
// calendarGrid.ts
groupByDueDate(tasks: TaskResponseDto[]): Map<string /* yyyy-MM-dd (local) /*/, TaskResponseDto[]>
buildMonthCells(anchor: Date): Date[]   // 42 cells, week starts per locale
buildWeekDays(anchor: Date): Date[]     // 7 cells
```

Date keys reuse `toInputDateValue` (local-date `yyyy-MM-dd`); `new Date(dueDate)` → key lookup matches the existing `DueDateField` convention. Week start: derive from `Intl.DateTimeFormat(locale, { weekday: 'long' })` resolved options / locale data (zh/en both Monday-start is fine; keep a single `getWeekStart` helper for testability).

### Task creation

`CalendarQuickAdd` uses existing `useCreateTask` with:

```ts
{ title, dueDate: fromInputDateValue(dateKey).toISOString(), scheduledType: NONE }
```

Optimistic update in `useCreateTask` already writes to `taskKeys.all` caches. The calendar list query (`['tasks', { completed: true, hasDue: true }]`) is under `taskKeys.all`, so `invalidateQueries({ queryKey: taskKeys.all })` in the mutation's `onSettled`/`onSuccess` refreshes it — verify the mutation invalidates `taskKeys.all` generically (it does today).

Task completion toggle: reuse `useCompleteTask` / `useUncompleteTask` (same invalidation story).

### Rendering

- `CalendarDayCell` shows at most N rows (month: 3 + "+X more" overflow indicator; week: all tasks). Overflow is display-only in v1 (clicking "+X more" can be deferred — accept: show count only).
- Today's cell highlighted; out-of-month cells dimmed.
- Completed tasks rendered with strikethrough / muted style consistent with `TaskItem`.

## Trade-offs

- **Client-side grouping vs. per-day queries**: one query for all due tasks keeps the page simple and cache-friendly; a user's total task count is small. Chosen.
- **`hasDue` filter vs. fetching all and filtering client-side**: server filter avoids transferring dead weight and keeps the query key honest. Chosen (small backend addition).
- **No new feed view**: feed views are bucket/status-based; a dueDate calendar doesn't map onto them. Using `GET /tasks` directly is cleaner.

## Compatibility & Rollout

- Additive only: new route, new components, one optional query param. No schema migration, no API breaking change.
- Rollback: revert the single commit / delete route entry.

## Testing

- Unit: `calendarGrid.test.ts` (month cells count/order, week start, grouping keys, cross-month boundaries).
- Component: `CalendarDayCell` renders tasks on the right key, quick-add calls `useCreateTask` with correct `dueDate`.
- Existing suites + `pnpm lint` + `pnpm typecheck` must pass.
