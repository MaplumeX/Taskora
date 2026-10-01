# 06 Tag 详情页：列出 Project，按归属分组

Status: implemented — awaiting visual acceptance
Blocked by: 01

## Problem

`TagDetail` 只平铺 Task，不列带这个 Tag 的 Project，也看不出任务属于哪个 Area 或 Project。

## Design

见 spec 第 5 节。

- 查询沿用 `useTasksQuery({ tagId })`，issue 01 之后已按有效 Tag 匹配。
- Project：从 projects 查询中筛出有效 Tag 包含当前 Tag 的项（未了结、未进 Trash），作为 Project 行显示。
- 布局用 `GroupedFeedListView`，按 Area / Project 分组，无归属的放在最前面。键盘 Selection 和 Grouped View 的现有规则一致。
- 页头去掉「返回 Tags」的文字按钮，改成和其他详情页一致的样式（色点 + 标题）。

## Acceptance

- Project 打了 Tag：详情页显示这个 Project 行，以及它下面所有未了结的任务（归在该 Project 分组下）。
- 自身带 Tag 的任务出现在其所属分组中。
- 组件测试覆盖分组和 Project 行。

## Comments

### 2026-10-01 — 实现

- `TagDetail` 把任务（`useTasksQuery({ tagId })`，issue 01 后按有效 Tag 匹配）和有效 Tag 命中的未了结、未进 Trash 的 Project 转成 `FeedItem`，交给 `GroupedFeedListView`（始终分组，不跟随时间视图的分组偏好）。键盘 Selection、拖拽重排沿用分组视图的现有行为。
- 页头去掉「返回 Tags」，改为色点加标题，与 Project / Area 详情页一致。
- 测试 1 个（Project 筛选规则与条目组成）。
