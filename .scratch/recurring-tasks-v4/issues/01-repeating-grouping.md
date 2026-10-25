# 01 Repeating 列表分组

Status: implemented

## Problem

Repeating 列表只能平铺，其他列表能按 Project / Area 分组。

## Design

见 spec 第 5 节。要点：

- `GroupedFeedListView` 新增 `reorderable`（默认 true）；false 时行不可拖、不注册 ⌘↑/⌘↓ 重排、不接收 Magic Plus。
- `Repeating` 页面用 `GroupedFeedListView`，`grouping` 取 `bucketGrouping`，带 TagFilterBar。
- `FlatFeedPage` 只剩 Deadlines。
- CONTEXT.md 的 Repeating 词条更新。

## Acceptance

- 偏好开启时按项目 / 区域分组，关闭时平铺；组内按计划日期升序。
- 行不可拖拽，⌘↑/⌘↓ 不重排。
- UI 测试、typecheck 通过。

## Comments

### 2026-10-25 — 实现

- 按设计实现。实际应用中发现：`reorderable=false` 时 dnd-kit 给行加 `aria-disabled`，整行被读成「已禁用」；`SortableFeedRow` 在 `dragDisabled` 时不再挂 dnd 的 attributes / listeners（Upcoming 多选时同样受益）。
