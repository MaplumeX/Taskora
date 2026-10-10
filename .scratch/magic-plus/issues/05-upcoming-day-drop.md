# 05 Upcoming 拖到某一天

Status: implemented — awaiting device acceptance
Blocked by: 02

## Problem

不能直接给 Upcoming 的某一天加任务。

## Design

见 spec「统一语义」。复用 `UpcomingDropZone` / `UpcomingGroupHeader` 的落点：放在某天的分组或组头上 → 计划日期为那天，插在落点。月份分组等无具体日期的落点按现有行拖拽规则处理（不接受则取消）。

## Acceptance

- 拖到「周五」一节松手 → 新任务计划为周五，位于落点。
- 与现有行拖拽在同一落点的日期结果一致。

## Comments

### 2026-10-10 — 实现

- `moveUpcomingTask`：被拖任务不在 items 里（草稿）时插入到落点；日期规则不变（来源组不存在 → 取落点组的日期，月份组为该组第一天）。
- `Upcoming`：接收 Magic Plus；碰撞直接用指针 y（浮层是圆形按钮，不走行拖拽的「朝移动方向的边缘」逻辑），草稿行不算锚点。松手按草稿日期新建（`scheduledType: DATE`），把草稿换成新任务后按显示顺序 `reorderFeed`；失败恢复。
- 测试：拖到某天（日期 + 顺序）、拖到月份（取第一天）。
