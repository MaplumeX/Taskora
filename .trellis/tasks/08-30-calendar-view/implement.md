# Calendar View — Implementation Plan

## Ordered Checklist

1. **Shared query filter (backend, additive)**
   - `packages/backend/src/tasks/dto/tasks.dto.ts`: add optional `hasDue?: boolean` to `TaskQueryDto` (`@IsOptional() @IsBoolean()` + `@Transform` like `completed`).
   - `packages/backend/src/tasks/tasks.service.ts` `findAll`: in the no-`view` branch, apply `where.dueDate = { not: null }` when `hasDue === true`.
   - `packages/frontend/src/lib/api/tasks.api.ts`: add `hasDue?: boolean` to `TaskQuery`.
   - Validation: `pnpm --filter backend typecheck` (and existing backend tests).

2. **Grid utils (pure functions + tests)**
   - Create `src/lib/utils/calendarGrid.ts`: `getWeekStart(locale)`, `buildMonthCells(anchor)`, `buildWeekDays(anchor)`, `groupByDueDate(tasks)`.
   - Create `calendarGrid.test.ts`: month = 42 cells / correct first & last cell; week start Monday for en/zh; grouping uses local-date key; empty map for tasks without dueDate.
   - Validation: `pnpm --filter frontend test -- calendarGrid`.

3. **Data hook**
   - Create `src/lib/hooks/useDueTasksQuery.ts` wrapping `useTasksQuery({ completed: true, hasDue: true })`.
   - Validation: typecheck.

4. **Calendar components**
   - `CalendarTaskRow` (checkbox + title, completed style).
   - `CalendarQuickAdd` (input → `useCreateTask` with `dueDate`, Enter submits, Esc blurs; empty title ignored).
   - `CalendarDayCell` (date header, today/out-of-month styling, task rows, overflow "+N", quick-add on click of the cell's add area / plus button).
   - `CalendarMonthGrid` (weekday header row + 6×7 cells).
   - `CalendarWeekGrid` (7 day columns, all tasks shown).
   - Component test: `CalendarDayCell.test.tsx` (renders tasks by key; quick-add fires create with correct ISO dueDate).

5. **Page + routing + navigation**
   - `src/pages/Calendar.tsx`: month/week toggle (state), prev/next/`Today` navigation, anchors the grids.
   - `src/router.tsx`: `{ path: '/calendar', element: <Calendar /> }`.
   - `Sidebar.tsx`: nav entry after Upcoming, icon `Calendar` (Upcoming keeps `CalendarDays`).
   - `ContentBottomBar.tsx`: add `/calendar` to `HIDE_ADD_TASK_ROUTES`.

6. **i18n**
   - `locales/{en,zh}/nav.json`: add `calendar`.
   - New namespace `locales/{en,zh}/calendar.json` (view toggle labels, Today button, quick-add placeholder, overflow "+{{count}} more", empty states).
   - Register namespace in i18n config if namespaces are explicitly listed.

7. **Full verification**
   - `pnpm lint` / `pnpm typecheck` / `pnpm test` all green.
   - Manual: navigate to `/calendar`, month nav, week toggle, click a day → create task → appears in cell; completed toggle works.

## Validation Commands

```bash
pnpm --filter @taskora/backend test && pnpm --filter @taskora/frontend test
pnpm lint && pnpm typecheck
```

## Risky Files / Rollback Points

- `tasks.service.ts` (shared `findAll` path): additive where-clause only — rollback = revert file.
- `useTasks.ts` mutation cache: no changes planned; if calendar list doesn't refresh after create, inspect `useCreateTask` invalidation scope first.
- All new UI code is new files + three small wiring edits (`router.tsx`, `Sidebar.tsx`, `ContentBottomBar.tsx`) — easy single-commit rollback.

## Pre-start Checks

- [x] prd.md / design.md / implement.md complete
- [ ] implement.jsonl / check.jsonl curated with real spec entries
- [ ] User approves final planning summary
