# Implementation Plan

## Context

- `ProjectMoreMenu` (trigger-style, the "More" ⋯ button) is used **only** on `ProjectDetail.tsx`.
- `ProjectContextMenu` (right-click wrapper) is used in `ProjectFeedRow` and `ProjectItem` (sidebar/feed list). It must NOT navigate.
- The shared `ProjectMenuPanel` has `handleDelete` which currently only invalidates queries on success.

## Approach

Thread an optional `onDeleted?: () => void` callback through the shared panel so only the detail-page menu triggers navigation. This keeps the sidebar context-menu path unchanged.

## Checklist

1. `packages/frontend/src/components/project/ProjectContextMenu.tsx`
   - Add `onDeleted?: () => void` to `ProjectMenuProps`.
   - In `ProjectMenuPanel`, destructure `onDeleted` and call it inside `handleDelete`'s `onSuccess` (after the existing `invalidateQueries` calls).
   - In `ProjectMoreMenu`, use `useNavigate()` from `react-router-dom` and pass `onDeleted: () => navigate('/today')` down to `ProjectMenuPanel`.
   - `ProjectContextMenu` (right-click variant) does **not** pass `onDeleted` — no behavior change for sidebar/feed.
2. Verify `ProjectDetail.tsx` needs no change (it already renders `ProjectMoreMenu`).

## Validation

- `pnpm --filter frontend typecheck` (or repo lint/tsc script).
- Manual: open a project detail → More menu → Delete → lands on `/today`.
- Manual: delete a project from sidebar right-click → current view unchanged.
