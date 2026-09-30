# 03 Upcoming / Calendar 下次预告（Repeat Preview）

Status: implemented
Blocked by: 01

## Problem

当前实例完成之前，用户在 Upcoming / Calendar 里看不到重复任务的下一次。

## Design

见 spec 第 4 节。要点：

- 纯函数 `buildRepeatPreviews(tasks, today, zones)` → `Array<{ sourceTaskId, title, dateKey, projectId, areaId }>`。只处理 ACTIVE、不在 Trash、DATE、带规则、anchor=scheduled 的任务；已有存活派生实例（按 `repeatSourceId` 判断）的跳过；下一次不晚于今天或链已终结的跳过。每条链只投影一次。
- Upcoming（`packages/ui/src/pages/Upcoming.tsx`、`packages/api/src/utils/upcomingLayout.ts`）：预告按日期并入 layout。预告行是一个独立组件（灰色标题加 ↻ 图标，无复选框），不注册到 `useSelectionScope`，不可拖拽。
- Calendar（`packages/ui/src/pages/Calendar.tsx`、`components/calendar/*`）：预告以弱化样式并入日格与 `CalendarDaySheet`，不计入日格内的任务数。
- 数据源：Upcoming 的 feed 只含未来任务，而逾期或今天的来源任务不在其中，所以预告需要从全部 ACTIVE 且带规则的任务中计算。可以新增一个轻量 hook，或者复用 `useScheduledTasksQuery`，实现时选开销更小的那个。
- CONTEXT.md 新增 Repeat Preview 词条。

## Acceptance

- 纯函数测试：已派生去重、anchor=completion 不投影、逾期来源、until、Trash 与已了结任务不投影。
- Upcoming：今天到期的每日任务，明天一格出现它的预告；完成后预告消失，被真实实例取代。
- Calendar：预告出现在对应日格；键盘导航跳过预告行。

## Comments

### 2026-09-30 — 实现

- 纯函数：`buildRepeatPreviews(tasks, context)`（`packages/engine/src/domain/repeat-preview.ts`）。判断「下一次已派生」时，先看 `repeatSourceId`；对没有该字段的存量实例，再看确定性 id 是否存在；进了 Trash 的实例不算。
- 数据源：新增 hook `useRepeatPreviews()`（api 包），直接复用 Calendar 已有的 `useScheduledTasksQuery`（全部未进 Trash、带计划日期的任务，含已了结），它同时覆盖来源任务与已派生实例，不需要另加查询。跨午夜或切换时区时，随 `useCalendarDay` 重新计算。
- Upcoming：`buildUpcomingLayout` 新增可选的 `previews` 参数，`UpcomingDay.previews` 排在当天真实条目之后；只有预告的日子也会在月份小节里出现。预告行不注册到 Selection。
- Calendar：日格中预告以虚线弱化色块显示，和任务一起占格位、参与「+N」溢出计算，但不计入 aria-label 里的任务数；日详情面板用 `RepeatPreviewRow` 列出预告，有预告时不显示「当天没有任务」的空态。
- 新组件 `RepeatPreviewRow`：与任务行同高、同对齐，复选框槽位放 ↻，悬停提示「重复任务的下一次」，点击无反应。
- CONTEXT.md 已新增 Repeat Preview 词条。
- 已知边角：派生实例被用户移到 Someday（不再带计划日期）时，不在数据源里，来源任务的预告会重新出现。这需要先撤销完成来源任务、再把实例移出日期，属于罕见路径，接受。
- 测试：
  - engine：投影与排序、各种不投影条件、repeatSourceId / 存量 id / Trash 三种去重；
  - api：layout 按周与月份归位、只有预告的日子、窗口外丢弃；
  - ui：日格虚线色块与计数、日详情面板的只读行。
- 验证：各包 typecheck 与 eslint 通过。engine 198、api 331、ui 334、backend 289、desktop 51、mobile 71、frontend 16 个测试全部通过。尚未在真实应用里目视确认。
