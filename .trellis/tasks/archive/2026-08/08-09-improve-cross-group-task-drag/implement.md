# Implementation plan: cross-group task drag preview

## Preconditions

- Review and approve `prd.md` and `design.md`.
- Start the task only after explicit approval of the latest planning summary.
- Load curated frontend specs/research from `implement.jsonl` before editing.

## Ordered checklist

- [ ] 1. Refactor `ProjectTaskLayout` task movement into pure placement helpers while preserving the existing heading movement and serialization contracts.
- [ ] 2. Add focused helper tests for before/after cross-group placement, heading-first, container-end, empty/ungrouped targets, same-group index correction, no-op behavior, and immutability.
- [ ] 3. Add task-drag session state: drag-start snapshot, active compact task, prop-sync guard, and shared cleanup/restore helpers.
- [ ] 4. Add task-specific collision resolution with pointer-first nested-target priority and keyboard `closestCenter` fallback; keep heading collision behavior isolated.
- [ ] 5. Implement `onDragStart`, `onDragOver`, `onDragCancel`, and revised `onDragEnd` so hover is local-only, cancel/outside restores, and changed drop persists exactly once.
- [ ] 6. Blur-save and collapse an expanded task on drag start; ensure it remains collapsed after drop/cancel.
- [ ] 7. Keep `DragOverlay` mounted and render a compact, non-interactive `TaskItem` clone while the active in-list node becomes a task-height insertion placeholder.
- [ ] 8. Remove destination-container background tint, retain empty-container hit area, and tune placeholder/overlay styling with existing theme tokens.
- [ ] 9. Add focused component/event regression coverage for mutation call counts, cancel/restore, expanded collapse, compact preview, no group tint, and heading drag preservation.
- [ ] 10. Review the diff against project-page-only scope; confirm no API/backend/i18n or generic task-list behavior changed.

## Validation commands

Run from repository root:

```bash
pnpm -F @taskora/frontend test -- ProjectTaskLayout.test.tsx
pnpm -F @taskora/frontend typecheck
pnpm -F @taskora/frontend lint
pnpm -F @taskora/frontend test
```

Manual verification:

- Drag between two populated headings and verify upper/lower-half before/after preview.
- Drop on a heading, trailing blank space, an empty heading, and the ungrouped area.
- Drag an expanded task with a focused edited field and confirm blur-save plus compact collapse.
- Cancel with Escape and release outside valid targets; verify visual restoration and no network reorder.
- Drag a heading and use keyboard task drag to confirm existing behavior remains usable.
- Drag near the viewport edge and confirm automatic scrolling still works.
- Simulate a reorder request failure and confirm server layout restoration plus save-failed toast.

## Risky areas and rollback points

- **Nested collision ambiguity:** keep collision filtering isolated so it can be reverted without touching layout persistence.
- **Same-container off-by-one:** land pure helper tests before wiring events.
- **Stale state during rapid hover/end:** keep current preview in a ref or otherwise guarantee end handlers read the latest layout.
- **Expanded editor data loss:** blur the focused editor before clearing expanded state; rollback this step independently if existing blur-save tests regress.
- **Scope creep:** do not modify `TaskList`, `ProjectCompletedTasks`, backend services, shared DTOs, or locale files.
- Full rollback is limited to `ProjectTaskLayout.tsx` and its test changes; planning/spec artifacts remain as the decision record.

## Review gates

- Helper tests pass before event/render integration.
- Focused project-layout tests pass before the full frontend suite.
- Last-iteration Trellis check verifies spec compliance, lint, typecheck, tests, data flow, and no unrelated DnD regressions.
