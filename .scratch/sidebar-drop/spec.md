# 桌面 / Web：拖到侧边栏（Sidebar Drop）

Status: implemented — awaiting manual acceptance

对齐 Things 3 Mac：Task（含 Selection 多选整组）与 Project 行可直接拖放到侧边栏的 Inbox / Today / Someday / Logbook / Trash / 区域 / 项目上，作为移动、计划、完成、删除的快捷方式。接续 `.scratch/desktop-multi-select` 的 Out of Scope。术语见 `CONTEXT.md` 的 **Sidebar Drop**；架构见 ADR 0018。

## Problem Statement

现在要把任务挪到另一个项目 / 区域、改到今天或 Someday、完成或删除，只能右键或打开卡片走「移动」「计划」选择器，要点好几下。侧边栏就在旁边、列着所有目的地，却不能作为落点。拖拽排序只在各列表内部有效，任务拖不出所在列表。

## Solution

桌面 / Web 上，用指针把 Task 行（多选时拖整组）或 Project 行拖到侧边栏某一行上松手，即对条目执行该行对应的既有动作。可接收的行悬停时高亮；松手后停留在当前页面，已不符合当前视图的条目直接离开视图，Selection 清空。触控端不变。

### 落点语义

Task（单个或多选整组，逐项执行）：

| 侧边栏行 | 效果（复用既有动作） |
|---|---|
| Inbox | 移动 → Inbox：清除归属与计划（计划日期、提醒、重复规则随之清除），截止日期保留 |
| Today | 计划改为今天（同计划卡片选「今天」：提醒 HH:mm 保留，截止日期不变） |
| Upcoming | 条目不动，在 Upcoming 行旁弹出计划日期卡片；选定后写入（多选整组共用一张卡片、不预选） |
| Anytime | 清除计划（同计划卡片「清除」）；无归属的 Inbox 任务转入 Anytime；已在 Anytime 的跳过 |
| Someday | 计划改为 Someday（重复规则按现有规则清除，截止日期保留） |
| Logbook | 完成（重复任务照常派生 Repeat Instance） |
| Trash | 删除 |
| 区域 | 移动 → 区域：离开原项目 / Heading，计划不变 |
| 项目 | 移动 → 项目：落在无 Heading 部分末尾，计划不变 |

Project 行（单个）：

| 侧边栏行 | 效果 |
|---|---|
| 区域 | 归属改为该区域，排在区域内项目末尾 |
| Today | 项目计划日期改为今天 |
| Upcoming | 项目不动，弹出计划日期卡片 |
| Anytime | 清除项目计划 |
| Someday | 项目计划改为 Someday（成为 Later Project，离开侧边栏） |
| Logbook | 完成项目；有未了结任务时沿用「剩余任务完成 / 取消」询问；重复项目照常派生下一轮 |
| Trash | 删除项目（任务随之进 Trash） |
| Inbox / 项目 | 不接收 |

不是落点：助手、Calendar、回顾、「N 个稍后项目」入口、Tags；侧边栏没有「无区域」落点。

## User Stories

1. As a desktop user, I want to drag a task onto a project in the sidebar, so that I can move it there without opening the Move picker.
2. As a desktop user, I want to drag a task onto an area in the sidebar, so that the task belongs directly to that area.
3. As a desktop user, I want to drag a task onto Inbox, so that it goes back to being unsorted (owner and schedule cleared, deadline kept).
4. As a desktop user, I want to drag a task onto Today, so that it is scheduled for today without opening the When picker.
5. As a desktop user, I want to drag a task onto Someday, so that it is parked for later.
6. As a desktop user, I want to drag a task onto Logbook, so that it is completed in one gesture.
7. As a desktop user, I want to drag a task onto Trash, so that it is deleted in one gesture.
8. As a desktop user with several tasks selected, I want dragging one of them onto a sidebar row to apply that row's action to the whole selection, so that batch moves are as quick as single ones.
9. As a desktop user, I want the drag overlay to show the number of tasks while I drag a selection to the sidebar, so that I know how many will be affected.
10. As a desktop user, I want to drag a project row from a grouped view or area page onto an area, so that I can re-file the project.
11. As a desktop user, I want to drag a project row onto Today / Someday, so that I can reschedule the whole project.
12. As a desktop user, I want to drag a project row onto Logbook, so that it is completed, and I am still asked what to do with its remaining tasks.
13. As a desktop user, I want to drag a project row onto Trash, so that it is deleted along with its tasks.
14. As a desktop user, I want sidebar rows that accept the dragged item to highlight while I hover them, so that I know where it will land.
15. As a desktop user, I want rows that do not accept the dragged item (e.g. Inbox for a project, Upcoming, Anytime) to show no reaction, so that the sidebar stays calm.
16. As a desktop user, I want the empty slot in the source list to snap back to its original position while my pointer is over the sidebar, so that no in-list reorder is implied.
17. As a desktop user, I want to stay on the current page after dropping, so that I can keep working through the list.
18. As a desktop user, I want items that no longer match the current view to disappear right after dropping, so that the list reflects reality.
19. As a desktop user, I want the selection cleared after a sidebar drop, so that I don't act on invisible items.
20. As a desktop user, I want dropping onto the project / area a task already belongs to, or onto Today for a task already scheduled today, to do nothing harmful, so that accidental drops are safe.
21. As a desktop user dragging a mixed selection, I want only the tasks that are not already at the target to change, so that nothing gets reset unexpectedly.
22. As a desktop user, I want the sidebar to auto-scroll when I drag near its top or bottom edge, so that I can reach projects that are off-screen.
23. As a desktop user, I want dropping on a collapsed area row to move the item into that area, so that collapsed areas still work as targets.
24. As a desktop user, I want to start a sidebar drag from any list that already supports drag-sorting (project page, grouped views, Upcoming, area detail, search), so that the gesture works everywhere.
25. As a desktop user, I want sidebar project / area reordering to keep working exactly as before, so that the new feature doesn't break existing sorting.
26. As a desktop user, I want in-list drag-sorting (including multi-task drag) to keep working as before, so that nothing regresses.
27. As a touch user, I want nothing to change, so that long-press stays a pure reorder gesture and batch actions stay in Multi-Select Mode.

## Implementation Decisions

- **One shared drag context (ADR 0018)**: lift `DndContext` to the app shell, shared by the sidebar and the content pane. Each surface (every list, the sidebar's project/area sorting) registers its own drag handlers and only receives events for its own id prefix. The current conventions (DragOverlay that follows the pointer, live preview, held order, FLIP, delayed collapse for multi-task drag) stay the same. Lists that turn drag off (e.g. filtered project views) must keep doing so through their registration.
- **Sidebar drop targets**: Inbox, Today, Someday, Logbook, Trash, every area row, and every project row in the sidebar register as droppables with a dedicated id prefix (distinct from the sidebar's existing sortable ids). The droppable id says what kind of target it is and carries the entity id.
- **Collision priority**: while the pointer is inside the sidebar, only sidebar drop targets are considered (they beat content-list droppables). The source list then treats `over` as "outside the list" and puts its placeholder back in the original slot.
- **Drop planning (pure function, new seam)**: input = dragged payload (one task / an ordered task group / one project, with current fields) + target. Output = reject, or an ordered list of per-item actions mapped to the existing mutations (task update DTO via the existing move-target DTO for Inbox/area/project; schedule today / Someday; complete; delete; project update / complete / delete). Items already matching the target are skipped. Project + Inbox/project target → reject. Acceptance only depends on the payload kind and target kind; per-item no-ops do not affect highlighting.
- **Execution**: the drop goes through the same mutation hooks and code paths as the context menu / pickers. The repeat-instance derivation, the project "settle remaining tasks" prompt, reminder rewrite rules and so on are not re-implemented. The selection is cleared after the drop. There is no navigation, no toast and no undo.
- **Hover feedback**: an accepting sidebar row shows a highlight in the sidebar accent style while it is the current `over` target. A non-accepting row gets no highlight and no disabled styling.
- **Auto-scroll**: the sidebar scroll area auto-scrolls when the pointer nears its edges during a drag.
- **Collapsed areas**: no spring-loading. A collapsed area row is itself the target.
- **Desktop / Web pointer only**: touch sensors and Multi-Select Mode are unchanged. The sidebar is not on screen in the touch layout anyway.
- **Glossary**: `CONTEXT.md` gains a **Sidebar Drop** entry, and Selection mentions that a group can be dragged to the sidebar.

## Testing Decisions

- Tests check external behavior (which mutations run with which data, selection state, route), not dnd-kit internals or the DOM structure.
- **Seam 1: the drop-planning pure function.** Table-driven unit tests in the style of the move-target tests. Cover every row of both semantic tables: task × each target, task group with partial no-ops, project × each target including rejects, an already-at-target no-op, Inbox clearing owner and schedule while keeping the deadline, and Anytime / Upcoming / Later entry not being targets.
- **Seam 2: component-level drag wiring.** Reuse the mocked-dnd-kit harness from the grouped feed / Upcoming / project layout tests (capture handlers, drive `onDragStart` / `onDragEnd` with a sidebar target id). Assert that the expected mutation hooks are called, that the selection is cleared, that the route is unchanged, that dropping on a sidebar target does not reorder the source list, and that in-list reorder and sidebar project sorting still behave as before under the shared context.
- Prior art: the move-target tests, the multi-task drag cases in the grouped feed view, project layout and Upcoming tests, `lib/dnd` tests, and the sidebar project section tests.

## Out of Scope

- Touch / Android.
- Project Headings as drag sources. Dragging projects onto other projects or onto Inbox.
- Logbook / Trash lists as drag sources (reopen / put-back semantics).
- Calendar as a drop target. A "no area" drop target.
- Spring-loaded expansion of collapsed areas.
- Toast or undo after a drop. Navigating to the target.
- Tags as drop targets.

## Further Notes

- ADR 0018 is `proposed`. Finalize the integration details (handler registration API, collision strategy) during implementation and mark it `accepted`.
- A sidebar drop can turn a project into a Later Project (Someday). It then disappears from the sidebar, which is expected.
