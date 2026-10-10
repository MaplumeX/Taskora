# 01 ListView `repeating`

Status: implemented

## Problem

没有地方集中看到所有重复任务与重复项目。

## Design

见 spec「Repeating」。

- engine `domain/views.ts`：`ListView` 增加 `repeating`；`ViewFields.repeatRule`；`taskMatchesView` / `projectMatchesView` 收录未了结、未进 Trash、带 Repeat Rule 的条目；`sortFeedItems` 按计划日期的日历日升序，同日按 feed 排序键；`viewNeedsCalendar` 包含 `repeating`。
- 设备后端粗筛、hub `buildTaskViewWhere` / `buildProjectViewWhere`（粗筛：ACTIVE、未进 Trash、计划类型 DATE）、feed DTO 校验、`FeedView`。
- 契约夹具加带 Repeat Rule 的任务与项目。

## Acceptance

- 契约测试三方通过：收录范围（未了结、含 Later Project 内任务、排除已了结与 Trash）、排序。

## Comments

### 2026-10-10 — 实现

- engine `views.ts`：`ListView` 加 `repeating`，`ViewFields.repeatRule`；按日历日排序的视图收进 `DAY_SORTED_VIEWS`（Deadlines → `dueDate`，Repeating → `scheduledDate`），`sortFeedItems` 共用一条路径。
- 设备后端 `queryFieldsOf` 带上 `repeatRule`，粗筛与 Deadlines 相同；hub 粗筛为 ACTIVE + DATE + 未进 Trash（不对 JSON 列做 null 过滤，规则由 domain 判定）。
- 契约夹具：`ContractTask` / `ContractProject` 加 `repeatRule`，`t-overdue`、`t-upcoming`、`p-today` 带每周规则，期望 `repeating: ['t-overdue', 'p-today', 't-upcoming']`；hub 契约不再把 `repeatRule` 覆盖成 null。
- `logging.test.ts`：手动模式下尚未移入的已完成重复任务不在 Repeating。
- 三方契约测试通过。
