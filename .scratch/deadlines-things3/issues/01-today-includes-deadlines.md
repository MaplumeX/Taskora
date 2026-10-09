# 01 Today 收录截止日期 ≤ 今天的条目

Status: implemented

## Problem

`taskMatchesView` / `projectMatchesView` 的 `today` 分支只看计划日期（`datePlacement`），截止日期到了的条目不进 Today。

## Design

- `packages/engine/src/domain/views.ts`：`today` 改为 `open && (计划日期 ≤ 今天 || 截止日期 ≤ 今天)`，Task 与 Project 都改；`ViewFields` 增加 `dueDate`。`upcoming` 不变。
- 粗筛只能放宽、不能收窄：
  - `packages/backend/src/tasks/views.ts`、`projects/views.ts` 的 `today` where 改为 `OR [{ scheduledType: DATE, scheduledDate: not null }, { dueDate: not null }]`；
  - `packages/api/src/engine/task-backend.engine.ts` 中视图 SQL 预过滤（约 843 行）同步放宽。
- `packages/api/src/events/task-query-match.ts` 的 `today` 判定同步加上截止日期路径。
- 行展示：Today 语境下，计划日期晚于今天的条目显示灰色短日期 chip。
- `CONTEXT.md` Deadline 词条按 spec 更新。

## Acceptance

- engine 单测：
  - 以下条目在截止日当天及之后出现在 Today：只有截止日期的 Inbox / Anytime 任务、Someday 任务、计划日期在未来的任务、Later Project 内的任务、带截止日期的项目；
  - 截止日前一天不出现；
  - 已了结、已进 Trash 的不出现。
- backend feed 与本地 engine 的 Today 结果一致（现有一致性测试补用例）。
- 把这类条目改到明天，它仍留在 Today；清除截止日期后离开。
- 实机检查：分组、拖拽排序正常，灰色 chip 显示正确。

## Comments

### 2026-10-09 — 实现

- 单测 / 契约测试已补并通过；实机尚未检查。
