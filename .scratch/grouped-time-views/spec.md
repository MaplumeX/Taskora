# Feature: Grouped Time Views（时间视图按项目/领域分组）

Status: ready-for-agent

## Problem Statement

在「今天」「随时」「将来」三个时间视图中，任务目前以平铺列表展示，跨项目的任务混在一起：用户无法一眼看出「这些事分别属于哪个项目」，也不能按项目为单位扫视和规划。尤其在「今天」里，用户的心智模型是「上午做 A 项目的三件事，下午做 B 项目的两件事」，平铺列表强迫用户在脑中自行重建这层结构。同时，项目行目前以独立行混在列表中（按项目自身日期出现），与其下任务没有视觉关联，用户难以理解「为什么这个项目孤零零出现在这里」。用户希望能够以项目（或领域）为分组标题查看任务，让项目/领域像小节标题一样组织时间视图。

## Solution

将「今天」「随时」「将来」改造为 **Grouped View（分组视图）**：视图内任务按其**直接父级**聚类显示——有项目的任务归入以该项目为 **Group Header（分组头）** 的组；无项目但有 Area 的任务归入 Area 组；既无项目又无 Area 的任务平铺浮于顶部。**分组是扁平单层的**：不显示 区域 → 项目 → 任务 的嵌套层级，区域下的项目与区域平级成组。组头是轻量的标题行（下横线分隔，无折叠按钮，参照项目内 Heading 的形态），项目组头保留进度环与日期徽章。组间顺序跟随侧边栏中项目/领域的全局视觉顺序（区域与项目混排），组内任务保留手动排序。跨组拖拽任务 = 改变任务归属。分组为纯渲染层推导：feed API 与数据模型完全不变，**不支持展开/收起**。Settings → General 提供全局开关「在时间视图中按项目/领域分组任务」（默认开启，随用户偏好跨设备同步），关闭时回到现有平铺形态。

## User Stories

1. As a Taskora user, I want tasks in Today grouped under their project, so that I can plan my day in project-sized chunks instead of scanning a jumbled list.
2. As a Taskora user, I want the same grouping in Anytime and Someday, so that all three time views share one consistent organization.
3. As a Taskora user, I want a project group header to appear whenever one of its tasks is in the view, so that I never see an empty group cluttering the list.
4. As a Taskora user, I want a project with no visible tasks in the view to not appear as a group header, so that the view stays tidy.
5. As a Taskora user, I want a project whose own scheduled date matches the view (but has no tasks in the view) to still appear as a standalone project row, so that "the project itself is due today" remains visible.
6. As a Taskora user, I want loose tasks (no project, no area) to float at the top ungrouped, so that quick captures remain immediately accessible.
7. As a Taskora user with area-level tasks, I want them grouped under an Area group header, so that my area organization is reflected too.
8. As a Taskora user with projects inside an area, I want their tasks grouped under the **project** header directly — a flat single level, not nested inside the area's group — so that each task carries exactly one grouping context.
9. As a Taskora user, I want group order to follow my sidebar ordering of projects and areas (areas and standalone/in-area projects interleaved in their global visual order), so that the mental model "today's layout mirrors my sidebar" holds and I can reorder views by reordering the sidebar.
10. As a Taskora user, I want to reorder tasks within a group by drag and drop, so that I keep manual prioritization inside each project.
11. As a Taskora user, I want group headers to be lightweight section titles — an underlined row without any collapse chevron — so that the structure reads as titles, not as foldable containers.
12. As a Taskora user, I want all groups always visible (no collapse/expand at all), so that no task is ever hidden behind state I forgot about.
13. As a Taskora user, I want the project progress ring (with complete/uncomplete toggle) on the project group header, so that I can settle an entire project from a time view.
14. As a Taskora user, I want to click a project group header's body to open the project detail page, so that the group header is also a navigation entry.
15. As a Taskora user, I want the existing context menu on project group headers, so that project actions (schedule, trash, etc.) remain available.
16. As a Taskora user, I want to click an area group header to open the area detail page, so that area groups are navigable too.
17. As a Taskora user, I want scheduled/due date badges on the project group header, so that the project's own dates stay visible.
18. As a Taskora user, I want to drag a task from one group into another to move it into that project, so that re-filing is one gesture.
19. As a Taskora user, I want to drag a task onto the ungrouped area to remove it from its project, so that un-filing is equally direct.
20. As a Taskora user, I want to drag a task onto a group header itself to drop it at the end of that group, so that headers are drop targets too.
21. As a keyboard user, I want j/k navigation to move across header rows and task rows, so that I can traverse the whole view.
22. As a keyboard user, I want Enter on a group header to open its detail page, consistent with today's project rows.
23. As a keyboard user, I want Alt+↑/↓ task movement to stop at group boundaries, so that an accidental keypress never silently re-files a task into another project.
24. As a keyboard user, I want "new task below" on a selected group header to create the task inside that parent, so that quick entry lands where my attention is.
25. As a Taskora user, I want tasks whose parent project is settled or trashed (but which are themselves still active) to appear ungrouped with their project tag, so that orphaned tasks surface instead of hiding under a dead group header.
26. As a Taskora user, I want a settings toggle "group tasks by project/area in time views" (default on) in Settings → General, so that I can return to the flat list if I prefer it.
27. As a multi-device user, I want the grouping toggle synced with my user preferences, so that all my devices share the same view mode like they share theme and language.
28. As a Taskora user, I want the Anytime view to include tasks that live inside projects (grouped), reversing the old "projects never appear in Anytime" rule, so that Anytime shows everything actionable.
29. As a Taskora user, I want group headers not to be draggable in the time views, so that there is a single source of truth for group order (the sidebar).
30. As a Taskora user, I want task rows inside groups to look and behave exactly like today's flat rows (checkbox, date badges, selection, expand), so that grouping adds structure without changing task interaction.
31. As a Taskora user, I want overdue tasks to stay within their groups with the existing date badge, so that grouping doesn't introduce special-case layout (overdue awareness is a separate future improvement).

## Implementation Decisions

### Scope

- Only three views change: **today, anytime, someday**. Upcoming (date-sectioned), Inbox (no projects by definition), Logbook and Trash (terminal views) are untouched.
- Feed API (`GET /feed/:view`) response shape is **unchanged**: flat `FeedItem[]` with `projectId`/`areaId` on task items. Grouping is a client-side derivation.
- Data model unchanged: task/project Position semantics, field-level LWW, Change Event flow all untouched.

### Domain model (CONTEXT.md updated)

- **Grouped View（分组视图）**: display form of a Bucket where tasks cluster under their direct parent; pure render-layer derivation.
- **Group Header（分组头）**: underlined title row above each cluster, appears iff the parent has ≥1 visible task; **no collapse affordance**; inter-group order follows the sidebar's global visual order. Distinct from **Project Heading** (static section inside a project).

### Grouping derivation (pure function, UI layer)

A pure module (modeled on the existing `sidebarProjectLayout` precedent: plain functions + vitest) computes the render block sequence from: flat feed items + projects list + areas list + grouping-toggle state.

Rules:
1. **Membership**: a task joins its direct parent — `projectId` if set, else `areaId` if set, else ungrouped. A task inside an area-scoped project joins the **project** group (the task's own `areaId` never reroutes it to the area group).
2. **Block order**: ungrouped tasks first (their existing order), then a **flat sequence of area groups and project groups** in the sidebar's global visual order: areas by their own Position; projects (both standalone and in-area) by their own Position relative to each other; an area is placed before the first project that sorts after it. No nesting: an in-area project group is a sibling of the area group, not a child.
3. **Group visibility**: a group header renders iff it contains ≥1 task present in the view. Parents with zero visible tasks produce no header.
4. **Standalone project row fallback**: a project whose own scheduled date matches the view but which has zero tasks in the view keeps appearing as the existing standalone project feed row (no group). This row's position follows the current merged feed ordering.
5. **Orphan tasks**: an active task whose parent project is settled (completed/cancelled) or trashed renders as ungrouped (keeps its project title tag on the row). Settled/trashed projects never get group headers. (Same rule for areas.)
6. **Within-group order**: tasks by global Position ascending (current feed order), draggable.
7. **Toggle off**: derivation is the identity — today's flat `FeedListView` rendering path.
8. **No collapse**: the derivation takes no collapse state and emits no selection-fallback mapping; every group's tasks are always visible.

### Group header rows

- **Project group header**: `ProjectProgressRing` (with existing complete/uncomplete toggle) + title + scheduled/due badges. **No chevron, no task count.** Click body → navigate to project detail. Existing `ProjectContextMenu` preserved.
- **Area group header**: area icon + area title. **No chevron, no task count.** Click → area detail page. No progress ring, no complete toggle (areas have no settled state).
- **Visual**: underlined section-title style modeled on `ProjectHeadingRow` (`border-b border-border pt-2`, `h-10` row, selection highlight) so keyboard Selection styling stays uniform.
- Group headers are **not draggable** (group order is owned by the sidebar).

### Drag & drop semantics

- **Within-group reorder**: writes back to the tasks' global Position via the existing reorder mutation (same as today's flat sortable path).
- **Cross-group drop**: reassignment — sets the task's `projectId` (clearing `headingId`) or `areaId` to the target group; dropping onto the ungrouped zone clears both. This mirrors Things 3's behavior.
- **Drop onto a group header**: allowed; the task lands at the end of that group.
- Reorder vs reassignment is disambiguated by drop target (position within same group = reorder; different group = reassign).

### Keyboard interaction (extends ADR-0004 selection model)

- `j` / `k` (and all selection movement): traverse all rows (headers and tasks); all rows are always visible.
- `Enter` on a group header: navigate to detail (existing project row behavior). `Space` stays bound to "new task below" per the existing keymap — on a header it creates the task inside that parent.
- `Alt+↑/↓` (moveUp/moveDown/moveFirst/moveLast): clamped at group boundaries — a task cannot leave its group via keyboard.
- "New task below" on a selected group header: creates the task inside that parent (projectId/areaId pre-set, no heading).
- **No `←`/`→` group collapse/expand** (groups cannot be collapsed). Bare arrow-left/right have no grouped-view binding.

### Settings toggle

- `UserPreferences` gains one field, `bucketGrouping: boolean` (default `true`), added to: shared DTO + `UpdatePreferencesDto`, `normalizePreferences` whitelist/fallback, and the Settings → General UI (switch, i18n label in zh/en).
- Persisted via the existing `PUT /users/me/preferences` merge pipeline; `hydrateFromServer` applies it on login — synced across devices, same as theme/language/weekStartsOn.
- Backend needs **no logic changes**: the preferences column is schemaless JSON; only the DTO whitelist expands.

### Feed behavior note

- The backend feed service keeps its current queries unchanged. The longstanding comment "Projects never appear in the inbox or anytime feeds" remains technically true at the data layer (project *rows* are still absent from anytime's feed); the semantic reversal ("Anytime now shows project tasks, grouped") happens entirely in the render layer. CONTEXT.md's glossary stays accurate.

## Testing Decisions

Good tests here assert **external behavior** (rendered block sequence, visible rows, mutations fired on drop, preference normalization) and never implementation details (component-internal state, hook call order).

Two seams, all following existing precedent — no new seam types:

1. **Grouping derivation pure module** (mirrors `sidebarProjectLayout.ts` + `sidebarProjectLayout.test.ts`). Pure vitest unit tests over fabricated `FeedItem`/`Project`/`Area` fixtures covering: membership by direct parent (in-area project tasks join the project group, no area nesting); ungrouped-first ordering; flat area/project groups in the sidebar's global visual order; group visibility rules (≥1 visible task); standalone project row fallback; orphan tasks under settled/trashed parents; within-group ordering; toggle-off identity.
2. **Component tests** (mirrors `ProjectTaskLayout.test.tsx`, reusing its dnd-kit harness-mock technique):
   - Grouped feed list: headers render as underlined rows without chevron/count; project header keeps progress ring (fires complete/uncomplete) and date badges; header body click navigates; context menu present; Enter navigates; Alt+↑/↓ clamps at group boundary; "new below" on header pre-fills parent; cross-group drop fires the reassignment mutation (projectId set, headingId cleared by the data layer on project change); drop on a header lands at the group's end; within-group drop fires reorder mutation.
   - Settings → General: toggle renders, fires the preferences mutation with the new field.
   - Preferences store: `bucketGrouping` normalization (invalid/missing → default `true`) and server hydration, mirroring `preferences.store.test.ts` cases.

Prior art: `packages/ui/src/components/layout/sidebarProjectLayout.test.ts` (pure layout logic), `packages/ui/src/components/project/ProjectTaskLayout.test.tsx` (dnd harness mocks), `packages/api/src/stores/preferences.store.test.ts` (preference normalization).

No backend tests: feed queries and preferences merge are untouched; only DTO whitelist expands (covered by shared-type compile + existing preferences tests).

## Out of Scope

- Upcoming / Inbox / Logbook / Trash views: unchanged.
- Overdue-task prominence in Today (badges, top section, counts): deliberately deferred as an independent improvement.
- Draggable group headers / reordering groups from within time views: group order is owned by the sidebar.
- Per-view grouping toggles (one global toggle only).
- Any collapse/expand of groups (state store, chevrons, keyboard bindings): removed by design.
- Any server-side grouping or feed API shape change.
- Changing the standalone project row's position semantics in today/someday (it stays in the merged feed order).

## Further Notes

- 术语以 CONTEXT.md 为准：Grouped View（分组视图）、Group Header（分组头）、Project Heading（项目内静态分组标题，不同概念）。
