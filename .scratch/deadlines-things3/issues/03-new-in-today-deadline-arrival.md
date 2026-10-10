# 03 New in Today 加入截止日期到来路径

Status: implemented
Blocked by: 01

## Problem

新到只看计划日期到来；截止日期到来进入 Today 的条目没有黄点。

## Design

- `FeedItemBase` 新增 `dueSetAt`（截止日期字段 HLC 墙钟），只在 Today 下发：
  - backend `feed.service.ts`：仿照 `scheduledSetAtOf` 从 `fieldClocks` 取；
  - 本地 engine `task-backend.engine.ts`：现有 `engine.list` 的 `clockOf` 只能带出一个字段的时钟（`row.clock`），需要扩展成同时带出 `scheduledDate` 和 `dueDate` 两个字段的时钟。
- `useNewInToday.ts`：
  - `isNewInToday` 判断计划日期、截止日期两条路径，任一成立即为新到；
  - `seenKeyOf` 取让它进入 Today 的日期，两条都成立时取计划日期。
- `CONTEXT.md` New in Today 词条按 spec 更新。

## Acceptance

- 单测：
  - 截止日期提前设好、日期到来 → 新到；
  - 当天才设成今天的截止日期 → 不算新到；
  - 两条路径都成立时已读键用计划日期；
  - 已读后改截止日期、新截止日到来 → 再次算新到。
- 横幅计数里包含这类条目。

## Comments

### 2026-10-09 — 实现

- 单测 / 契约测试已补并通过；实机尚未检查。
