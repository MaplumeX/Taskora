# 02 侧边栏 Today 红色截止日期计数

Status: implemented
Blocked by: 01

## Problem

`useBucketCounts` 的 Today 只有一个总数，到期 / 逾期的条目没有单独的提示。

## Design

- `useBucketCounts` 返回 `todayDueCount`（Today feed 中 `dueDate` ≤ 今天的条目数）和 `todayRestCount`（其余条目数）。
- `Sidebar` 的 `NavRow` 支持在灰色计数前再显示一个红色计数（用 `deadline` 色），为 0 的不显示，各自 `99+` 封顶；手机首页 Today 入口同样处理。
- 新到黄点保持现状。

## Acceptance

- 单测：两个数按截止日期正确拆分，两数之和等于 Today 条数。
- 实机检查：桌面、网页、手机三端显示正确，且与黄点同时出现时不挤压布局。

## Comments

### 2026-10-09 — 实现

- 单测 / 契约测试已补并通过；实机尚未检查。
