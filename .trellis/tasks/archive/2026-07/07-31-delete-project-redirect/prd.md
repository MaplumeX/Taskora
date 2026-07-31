# Delete project redirects to Today

## Goal

When the user deletes the project they are currently viewing on the project detail page (`/projects/:id`), navigate them back to `/today` instead of leaving them on an empty shell detail page.

## Requirements

- When a project is deleted via the project detail page's More menu (`ProjectMoreMenu`), the app navigates to `/today` after the delete succeeds.
- Deletion from the sidebar / list context (not on the detail page) does not change navigation behavior — it stays on the current list view.
- Only the deletion performed while the active route is `/projects/:id` triggers the redirect.

## Acceptance Criteria

- [ ] Delete a project from its detail page (`/projects/:id` via More menu) → URL becomes `/today`, the Today page is shown.
- [ ] Delete a project from the sidebar context menu → no navigation occurs, current view is unchanged.
- [ ] Delete error does not navigate away.
