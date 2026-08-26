# PRD: Things 3 style Upcoming visual skeleton

## Goal

把「近期」从「只列出有计划日期的任务」改成 Things 3 Upcoming 那种周计划板：从明天起的 7 天始终展开（含空日），日头用大数字 + 星期，「明天」用特称；7 天之后按月收束，只显示有事项的日子。任务行、勾选、展开编辑保持现有行为。

## Background

Cultured Code 官方 Upcoming 截图与文档（[Today/Upcoming 说明](https://culturedcode.com/things/support/articles/4001304/)）把 Upcoming 定义成未来日程纸，而不是按日期分组的扁平列表：

- 顶部固定列出接下来 7 天，从明天开始，空日也占位。
- 日头是大号日期数字 + 星期（第一天写 Tomorrow / 明天），右侧细线分割。
- 7 天之后瀑布流展示更远的事项：同月继续用日头，换月时出现月份标题。

当前 `packages/frontend/src/pages/Upcoming.tsx` 只把 `feed?view=upcoming` 里带 `scheduledDate` 的条目按日分组；没有事项的日子不出现；日头是小号灰色 `August 26, Wednesday`。空列表走 `task:upcomingEmpty`。`/upcoming` 仍隐藏底部添加（`ContentBottomBar.tsx` 的 `HIDE_ADD_TASK_ROUTES`），本次不改。

### Confirmed facts

- 后端 upcoming 语义已对齐 Things 3「不含今天」：`buildTaskViewWhere('upcoming')` / `buildProjectViewWhere('upcoming')` 为 `scheduledType=DATE` 且 `scheduledDate > now`，今天及过期在 Today。见 `packages/backend/src/tasks/views.ts:36-40`、`packages/backend/src/projects/views.ts:36-40`。
- Feed 已混入任务与项目：`FeedService.findAll` 合并后按 `sortOrder` / `createdAt` 排序。见 `packages/backend/src/feed/feed.service.ts:70-189`。
- 前端用 `toDateKey`（本地日历日 `yyyy-mm-dd`）分组，无 scheduledDate 的条目直接跳过。见 `Upcoming.tsx:42-52`、`packages/frontend/src/lib/utils/date.ts:61-65`。
- 任务行 `TaskItem` 右侧始终渲染 `TaskDateBadge`（计划日）和 `TaskDueDateBadge`（截止日）。见 `TaskItem.tsx:184-185`。项目行同样。见 `ProjectFeedRow.tsx:85-86`。
- `common:tomorrow` 中英已有（「明天」/「Tomorrow」）。`task:upcomingEmpty` 本次不再作为整页空态使用。
- 无 Upcoming 页面测试。主栏宽度 `max-w-2xl`（`MainContent.tsx:7`），本次不改。

## Requirements

### R1: 未来 7 天始终展开

从本地日历的明天起连续 7 天（明天 … 明天+6）必须全部渲染，即使某天 0 条事项。空日只显示日头，保留垂直占位。

整页不再使用「没有即将到来的任务」空态。加载失败仍显示 `common:loadFailed`。加载中保持现有「不渲染列表」行为。

### R2: 日头视觉

7 天窗口内的日头：

- 左侧大号等宽日期数字（当天的日，不含月）。
- 右侧紧跟标签：第一天用 `common:tomorrow`；其余 6 天用当前语言的星期全称（`Intl` weekday long）。
- 标签右侧一条细分割线。
- 日头不是可勾选行，不进入任务选择/展开。

### R3: 7 天之后按月收束

日期晚于「明天+6」的事项：

- 按日期升序排在 7 天窗口之后。
- 只渲染有事项的日子，不补空日。
- 某日所属年月若与「上一个已渲染日」（含 7 天窗口最后一天）不同，先插入月份标题再渲染该日。
- 月份标题：当前年用 `Intl` 月份长名称；非当前年带上年份。
- 这些日子的日头格式与 R2 相同（数字 + 星期），不再写「明天」。

同一事项只出现一次：落在 7 天窗口内的不在后面重复。

### R4: 日内条目与交互不变

每个日子内的任务/项目仍用 `FeedItemRow`：勾选完成、点击展开编辑、右键菜单、项目行跳转项目页。日内顺序保持 feed 返回顺序（后端 `sortOrder` / `createdAt`）。

因为日期已由日头表达，Upcoming 里的任务行和项目行不再显示计划日 `TaskDateBadge`；截止日 `TaskDueDateBadge` 仍显示。其他页面的徽章行为不变。

### R5: 数据与范围不变

不改 backend view、feed API、主栏宽度、底部栏、拖拽改期、在某天新增、右侧月历、系统日历事件、重复任务、标签筛选 chips。无 `scheduledDate` 的 feed 条目仍跳过。

## Acceptance Criteria

- **AC1**：系统日为 8 月 26 日时，无论有无事项，近期页从上到下先出现 8/27 … 9/2 共 7 个日头；8/27 的标签是「明天」/「Tomorrow」，其余为对应星期。
- **AC2**：这 7 天里某天没有任何 feed 条目时，该日仍有日头，日头下没有任务/项目行。
- **AC3**：全部 7 天都为空、且没有更远事项时，页面仍显示这 7 个空日头，不出现 `task:upcomingEmpty`。
- **AC4**：计划日在 7 天窗口内的任务出现在对应日头下；同一任务不在窗口后的月份区再出现。
- **AC5**：计划日为 9 月 12 日、窗口最后一天为 9 月 2 日时，9/12 出现在窗口之后；因为与 9/2 同月，9/12 前不插入月份标题。
- **AC6**：计划日为 10 月 3 日时，该日头前出现「十月」/「October」（当前年为 2026）；若年为 2027，月份标题带年份。
- **AC7**：Upcoming 任务行/项目行不显示计划日徽章，仍显示截止日徽章（若有）。Today / Inbox 等其他列表的计划日徽章不受影响。
- **AC8**：在 Upcoming 点击任务行仍可展开编辑；勾选仍可完成。项目行仍进入项目详情。
- **AC9**：feed 请求失败时显示 `common:loadFailed`，不渲染日头骨架。
- **AC10**：分组纯函数有单测覆盖 AC1–AC6 的日期结构（不依赖 DOM）。`pnpm --filter @taskora/frontend lint`、`typecheck`、相关单测通过。

## Out of Scope

- 拖到另一天改 `scheduledDate`。
- 在某一天下新增任务；底部栏继续对 `/upcoming` 隐藏添加。
- 右侧迷你月历跳转。
- 系统日历事件。
- 把 `dueDate` 作为 Upcoming 分组键（截止日只作为行内徽章）。
- 重复任务、标签筛选 chips、Tonight / This Evening。
- 修改 backend upcoming 查询或 feed 合同。
- 加宽 `MainContent`。
