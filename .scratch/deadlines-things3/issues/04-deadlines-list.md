# 04 Deadlines 隐藏列表（Quick Find 进入）

Status: implemented

## Problem

没有一个地方能按截止日期看到所有待办。

## Design

- `ListView` 新增 `deadlines`：
  - engine `taskMatchesView` / `projectMatchesView` 收录未了结、未进 Trash、带截止日期的条目（含 Later Project 及其内任务）；`viewNeedsCalendar` 不需要改；
  - backend 粗筛与 `task-query-match.ts` 同步；
  - 排序：截止日期升序，同一天内按 Position / Feed Position。
- 路由 `/deadlines`：页面复用 feed 列表，平铺，关闭拖拽排序。
- Quick Find：`lists` 增加 `{ to: '/deadlines', names: ['截止日期', 'Deadlines', 'Deadline'] }`；侧边栏不加入口。
- i18n：页面标题。`CONTEXT.md` 新增 Deadlines 词条。

## Acceptance

- engine 单测：收录范围、排序（逾期排最前、同日按位次）。
- Quick Find 测试：输入「截止」「dead」能命中这个列表。
- 实机检查：从 Quick Find 打开，行上显示倒计时，不能拖拽。

## Comments

### 2026-10-09 — 实现

- 单测 / 契约测试已补并通过；实机尚未检查。
