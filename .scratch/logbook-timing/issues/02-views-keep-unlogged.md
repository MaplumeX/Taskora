# 02 视图：Unlogged Item 留在原视图

Status: implemented
Blocked by: 01

## Problem

`taskMatchesView` / `projectMatchesView`（`engine/src/domain/views.ts`）只放未了结条目进非 Logbook 视图。Logbook 收入全部已了结条目。

## Design

见 spec 第 2 节。

- 非 Logbook 视图：放宽为「未了结，或 Unlogged Item」（Deadlines 除外，仍只列未了结）。Logbook：已了结且 `isLogged`。视图函数接收 `loggingContext`。
- 侧边栏项目列表、Area 页、Project 页同样留下未移入的已了结项目 / 任务。
- 位置：按原有排序留在原位。
- 行：删除线 + 弱化，复用 Logbook 行的样式（`TaskItem` / `FeedItemRow`）；Logbook 首次渲染时勾号不播放动画的规则同样适用。
- Quick Find（`domain/search.ts`）：Unlogged Item 归入常规结果组。
- 立即模式下行为与现在完全一致。

## Acceptance

- 手动模式：完成 Today 中的任务后它仍在 Today 原位（删除线），不在 Logbook；执行 Log Completed 后反过来。
- 每天模式：昨天完成的不在原视图、在 Logbook；今天完成的反之。
- 已完成未移入的项目留在侧边栏，可进入；移入后其中的任务一起进入 Logbook。
- 视图函数单测覆盖以上情况；立即模式的现有用例不变。

## Comments

### 2026-10-10 — 实现

- `views.ts`：非 Logbook 视图（Deadlines 除外）放宽为「未了结或 Unlogged Item」，Logbook 要求已移入；`taskMatchesQuery` 的非 completed 分支同样放宽（项目页 / Area 页 / Tag 页）。
- 设备引擎（`task-backend.engine.ts`）与 hub（`feed.service` / `tasks.service`）都把移入时机放进视图上下文；非立即模式下 SQL 粗筛不再按 status 限定。hub 的 `calendarContextFor` 改为总是读一次偏好。
- 搜索：`planTaskSearch` 接收 context，Unlogged Item 进默认范围、与未了结同档；Quick Find / 搜索页的项目与任务分组同样处理。
- UI：侧边栏、Area 页、Tag 页按 `useIsLogged` 留下未移入的已完成项目；`ProjectSettledTasks` 只收已移入的；各列表勾选框对已取消条目改为撤销取消。
- 偏好变化不会触发 Engine 的变更通知：`useCalendarQueryRefresh` 的键加上移入时机与水位线。
- 测试：`api/src/engine/logging.engine.test.ts`（设备引擎端到端）。
