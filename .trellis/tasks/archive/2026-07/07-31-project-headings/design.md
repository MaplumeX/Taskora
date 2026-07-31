# Design: Project Headings

## 1. Architecture and boundaries

Introduce a `ProjectHeading` domain owned by the project and expose a project-layout mutation that atomically persists heading order, task membership, and task order.

```text
ProjectDetail
  ├─ GET /tasks?projectId=:id
  ├─ GET /project-headings?projectId=:id
  └─ ProjectTaskLayout
       └─ POST /project-headings/reorder

ContentBottomBar
  └─ POST /project-headings
```

The generic task lists remain unchanged. Heading-aware rendering is limited to `ProjectDetail`, preventing project-specific structure from leaking into Today, Anytime, Search, Trash, and other aggregate views.

## 2. Data model

Add a Prisma model:

```prisma
model ProjectHeading {
  id        String   @id @default(uuid())
  title     String
  sortOrder Int      @default(0)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tasks     Task[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([projectId])
}
```

Add `headingId String?` and a `ProjectHeading?` relation to `Task`, using `onDelete: SetNull`. Add inverse relations to `User` and `Project`.

Invariants:

- a heading and every directly assigned task belong to the same user and project;
- only top-level tasks (`parentId = null`) may be directly assigned to a heading;
- `Task.sortOrder` is interpreted within its current project container (ungrouped or one heading) on the project page;
- legacy tasks have `headingId = null` and therefore remain visible in the ungrouped container.

The migration is additive and requires no data backfill.

## 3. Shared contracts

Add `project-heading.dto.ts` and export it from `@taskora/shared`:

```ts
interface CreateProjectHeadingDto {
  projectId: string;
  title: string;
}

interface UpdateProjectHeadingDto {
  title?: string;
}

interface ProjectHeadingResponseDto {
  id: string;
  projectId: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface ProjectHeadingLayoutGroupDto {
  headingId: string;
  taskIds: string[];
}

interface ReorderProjectHeadingLayoutDto {
  projectId: string;
  ungroupedTaskIds: string[];
  groups: ProjectHeadingLayoutGroupDto[];
}
```

Add `headingId: string | null` to `TaskResponseDto`. Direct task create/update does not expose arbitrary heading assignment in this MVP; membership changes go through the atomic layout endpoint.

Backend DTO classes apply `class-validator` at the HTTP boundary, including nested array validation for layout groups.

## 4. Backend module and API

Create a `project-headings` NestJS module registered in `AppModule`.

Endpoints:

- `GET /project-headings?projectId=:projectId` — list headings ordered by `sortOrder`, then `createdAt`.
- `POST /project-headings` — verify project ownership, append at `max(sortOrder) + 1`, allow an empty title for immediate inline editing.
- `PATCH /project-headings/:id` — verify ownership, update title.
- `DELETE /project-headings/:id` — delete a heading and soft-delete its task subtree.
- `POST /project-headings/reorder` — persist the complete visible project layout atomically.

### Layout transaction

The reorder service uses an interactive transaction:

1. Verify that the target project belongs to `userId`.
2. Load active headings in the project and active top-level project tasks.
3. Reject duplicate IDs, foreign IDs, cross-project IDs, child-task IDs, omitted visible IDs, or unknown IDs.
4. Update heading `sortOrder` from `groups` order.
5. Update each task with its container's `headingId` (`null` for ungrouped) and group-local `sortOrder`.

The endpoint accepts a complete layout rather than separate move/reorder calls, so cross-container moves cannot leave `headingId` and `sortOrder` partially updated.

### Heading deletion transaction

Deletion uses an interactive transaction:

1. Load the heading by `id + userId`.
2. Load all of the user's tasks needed to build a `parentId` child map.
3. Seed a BFS with tasks directly assigned to the heading and collect all descendants.
4. Set `trashedAt = now` for the collected IDs without changing `status`.
5. Delete the heading; `onDelete: SetNull` removes the stale heading reference.

Restored tasks therefore reappear ungrouped. Deleting a project does not delete its headings because project deletion is soft; permanent project deletion from empty-trash cascades to headings at the database layer after tasks have been removed.

### Task compatibility

When `TasksService.update` moves a task to a different project or removes it from a project, clear `headingId` to maintain the same-project invariant. Feed DTO mapping includes `headingId`, but aggregate renderers ignore it.

## 5. Frontend data layer

Add:

- `lib/api/project-headings.api.ts`
- `lib/hooks/useProjectHeadings.ts`

Query keys are scoped by project:

```ts
const projectHeadingKeys = {
  all: ['project-headings'] as const,
  list: (projectId: string) => ['project-headings', { projectId }] as const,
};
```

Create/update/delete/layout mutations invalidate the affected heading list and all task lists. Layout uses the existing half-optimistic convention: update the project task cache and heading cache immediately, invalidate on error and settle, and let `ProjectTaskLayout` show a failure toast.

## 6. Project layout UI

Replace the generic `TaskListView` only inside `ProjectDetail` with a heading-aware `ProjectTaskLayout`. Reuse existing task row rendering, completion mutations, row selection, and expanded-task behavior.

Layout shape:

```text
Ungrouped task container (always before headings; label hidden)
Heading row A
  Task container A
Heading row B
  Task container B
```

Use namespaced DnD IDs (`heading:<id>`, `task:<id>`, `container:ungrouped`, `container:<headingId>`) to prevent collisions. The component keeps a temporary normalized layout during drag and submits the complete layout on drag end.

- dragging a heading reorders complete heading blocks;
- dragging a task reorders inside a container or changes container;
- empty containers remain valid drop targets;
- keyboard/accessibility attributes supplied by dnd-kit remain attached to drag handles/rows;
- save failure invalidates optimistic caches and shows `common:saveFailed`.

Add a `ProjectHeadingRow` component with inline title editing and a more menu containing Delete. Delete opens a confirmation dialog whose copy states that all tasks under the heading will be moved to Trash.

## 7. Creation flow

`ContentBottomBar` detects `/projects/:id` and shows a dedicated heading icon button beside Add Task. It calls the create mutation with `{ projectId, title: '' }`, stores the created heading ID in the existing pending-auto-edit UI state, and the matching heading row consumes that ID to focus/select the title.

The backend append rule guarantees the new empty heading appears at the end even before a reorder occurs.

## 8. i18n and visual behavior

Add matching keys to `zh/project.json` and `en/project.json` for:

- add heading;
- heading placeholder;
- delete heading;
- destructive confirmation;
- creation/deletion errors where existing common messages are insufficient.

Use the existing warm, restrained interface language: a typographic heading row with clear spacing and subdued controls, no checkbox, card chrome, gradient, or heavy shadow.

## 9. Compatibility, rollout, and rollback

- Additive nullable migration keeps existing data valid.
- Other list APIs and components continue consuming tasks with one extra nullable response field.
- Rollback of application code is safe while the additive columns/table remain.
- Database rollback should occur only after confirming no heading data must be retained.

## 10. Risks and mitigations

- **Cross-container DnD state drift:** submit one complete validated layout and invalidate on failure.
- **Authorization through IDs in a batch:** verify every heading/task against `userId` and `projectId`, and reject duplicates/omissions.
- **Subtask accidental grouping/deletion:** only top-level tasks may have `headingId`; deletion explicitly BFS-cascades descendants.
- **Project restore regression:** headings are not soft-deleted when the project is trashed, so restoration preserves structure.
- **Generic list regression:** heading-aware rendering is isolated to `ProjectDetail`.
