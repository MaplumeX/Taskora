# 06 角标与 Today 新到排除 Unlogged Item

Status: implemented
Blocked by: 02

## Problem

视图放宽后，Unlogged Item 可能被计进侧边栏 / 首页角标和 Today 新到。

## Design

见 spec 第 2 节。

- 角标：只计未了结条目。
- Today 新到（`todayReviewedOn` / `todaySeenKeys` 的推导）：已了结条目不算新到，不显示黄点，不计入横幅数量，也不影响「仍有未读新到」的入口黄点。
- 项目进度环照常把 Unlogged Item 计为已完成（`countProjectTasks` 不变）。

## Acceptance

- 手动模式下完成 Today 中的任务后，Today 角标减 1；Today 中已了结的条目不显示新到黄点。
- 单测覆盖角标与新到推导。

## Comments

### 2026-10-10 — 实现

- `useBucketCounts` 只数未了结条目；`useNewInToday` 的新到判定排除已了结条目；Android 状态栏常驻通知只列未了结任务。
- 测试：`useBucketCounts.test.ts` 新增用例。
