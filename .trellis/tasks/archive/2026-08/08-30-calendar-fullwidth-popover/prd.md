# Calendar month view: full-width layout, viewport-height grid, popover overflow

## Goal

解决月视图"格子显小、显示不了多少条目"的问题：让日历页满宽、网格撑满视口高度（6 个星期行均分）、条目行紧凑化，并把 "+N more" 从死文本升级为 FullCalendar 默认风格的 popover（展示当天全部任务）。

## Background / Research 结论

- 现有 `MainContent.tsx` 将所有页面限制在 `max-w-2xl`（672px）+ `px-6 pt-8 pb-12` 的列表页容器中，日历被挤压是"显小"的根源
- 业界方案（FullCalendar / Google Calendar / Notion Calendar）：日历是"画布型"页面，满宽满高；星期行用 `grid-template-rows: repeat(6, minmax(0,1fr))` 均分视口剩余高度；事件 chip 紧凑（~20-24px）；溢出走 `+N more` → popover（FullCalendar `moreLinkClick: "popover"` 默认行为）

## Requirements

- **R1 满宽布局（用户已选方案 A：满宽）**
  - `/calendar` 页面突破 `MainContent` 的 `max-w-2xl` 窄容器，横向占满主内容区（保留合理的小 padding，如 `px-4`/`px-6`，不做视觉贴边）
  - 其他页面布局不受影响；实现方式由实现者定（如 MainContent 按 route 提供 wide 变体、或 AppShell 层针对 calendar 路由切换容器类），不改坏现有页面的滚动行为
- **R2 网格撑满视口高度**
  - Calendar 页整体改为纵向 flex 布局占据主区可用高度（`h-full` / `flex-1`，注意 `MainContent` 的 `overflow-y-auto` 与 AppShell `h-dvh` 结构）
  - 月网格改为 `grid-rows-6`（`repeat(6, minmax(0, 1fr))`）均分剩余高度，星期行高度跟随视口而非固定 `min-h-24`；在常规桌面视口下 6×7 网格应接近撑满视口（标题栏/工具栏之下）
  - 保留合理最小高度兜底（小屏/短视口不塌陷）
- **R3 紧凑条目行**
  - `CalendarTaskRow` 压缩为紧凑 chip 风格（高度约 22-24px），单行截断保留 `title` 提示；勾选完成、删除线、hover 行为不变
- **R4 "+N more" Popover（用户已选方案 B：FullCalendar 默认 popover）**
  - 点击 "+N more" 弹出 popover：显示该日期标题 + 当天全部任务列表（复用 `CalendarTaskRow`），可勾选完成、可点击任务（行为与格内一致）
  - popover 定位在被点击的 "+N more" 附近（已有 Popover 组件则复用 `@/components/ui/popover`，无则用最接近的现有方案）；点击外部关闭；不溢出视口
  - 溢出条目数计算改为跟随格子实际高度的动态上限不可行时，可保留固定 `maxRows`（实现者可用 `dayMaxEventRows: true` 思路：按格子高度估算可见行数，或保守固定值 + popover 兜底，二选一并说明）
- **R5 不破坏既有行为**
  - 快速添加（单击空白/加号/双击）、今日高亮、out-of-month 半透明、`weekStartsOn`、i18n（Intl 格式化、zh/en key parity）全部保留
  - 既有测试通过；因布局/交互改动需要更新或新增的测试属预期范围（建议为 popover 交互补测试）

## Non-Goals

- 不改后端
- 不做周视图/日视图恢复
- 不做事件拖拽、跨日拖放
- 不改 Upcoming 页面

## Acceptance Criteria

- [ ] AC1: `/calendar` 满宽显示，其他页面仍为 `max-w-2xl` 居中容器，视觉无回归
- [ ] AC2: 常规桌面视口下，6×7 网格纵向撑满主区可用高度（星期行等分），无整页滚动或仅小屏兜底时滚动
- [ ] AC3: 格内条目为紧凑单行 chip；勾选完成/删除线/hover 正常
- [ ] AC4: 当条目超出可见上限时显示 "+N more"，点击弹出 popover 展示当天完整列表，popover 内可勾选完成，点击外部关闭
- [ ] AC5: 快速添加、今日高亮、out-of-month 半透明、weekStartsOn、i18n 均正常
- [ ] AC6: 前端 lint / typecheck / test 全部通过
