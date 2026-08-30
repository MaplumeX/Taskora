# PRD: Remove task creation from calendar view

## Background

The calendar month view currently embeds multiple "create task" entry points (quick-add).
The product decision is that the calendar is a read/overview surface; task creation belongs
to other views. All creation affordances must be removed from the calendar UI.

## Requirements

- R1: Remove the `CalendarQuickAdd` component and its usage (`CalendarDayCell.tsx`).
- R2: Remove the single-click / double-click blank-area quick-add handlers on day cells,
  and the hover "+" plus button in the day cell header.
- R3: Keep all read-only/interaction features intact: task rows, complete toggle,
  overflow "+N more" popover, today highlight, out-of-month dimming.
- R4: Remove now-unused i18n keys (`calendar:quickAddPlaceholder`, `calendar:addTaskOnDate`)
  from `zh/calendar.json` and `en/calendar.json` if no other usage exists.
- R5: Update/remove tests in `CalendarDayCell.test.tsx` that cover quick-add behavior;
  add a regression test asserting clicking the blank area does NOT open an input.

## Acceptance criteria

- No textbox / quick-add input can be opened anywhere in the calendar view
  (blank-area click, double click, plus button).
- Task list display, completion toggle, overflow popover still work as before.
- No unused imports/components/dead code left (`CalendarQuickAdd.tsx` deleted,
  `useCreateTask` mock in tests removed).
- No unused i18n keys remain for removed features.
- Frontend type-check / lint / unit tests pass.
