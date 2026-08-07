# Calendar date picker for scheduled date field

## Goal

把任务展开区的「计划日期」编辑体验从「无 / 日期 / Someday 三态 segmented control + 原生 `<input type="date">`」重构为一个真正的月历面板：点日历图标直接弹出日历，用户选日期 = DATE、点 Someday = SOMEDAY、点清除 = NONE，scheduledType 成为用户动作的派生结果而非预先声明的中间状态。

## Background

当前 `ScheduledDateField.tsx` 的交互割裂：

1. 先在「无 / 计划日期 / Someday」三按钮里选类型
2. 选中「计划日期」后才出现原生 `<input type="date">`
3. 原生日期选择器各浏览器样式不一，与 Things3 视觉差距大

`ScheduledType` 枚举（NONE/DATE/SOMEDAY）本身保留，只是不再以 segmented control 暴露给用户；类型由用户在日历面板里的动作派生。

## In Scope

- 新增 `react-day-picker` 依赖
- 新建 `Calendar` 基础 UI 组件（`src/components/ui/calendar.tsx`），基于 `react-day-picker`，Tailwind 样式，适配 light/dark 主题（`primary`/`accent`/`muted`/`ring` CSS 变量）
- 重写 `ScheduledDateField.tsx`：月历面板 + 底部「今天」「Someday」「清除」三个操作
- 新增 i18n key（`clear` / `today` 复用现有，`somedayLabel` 复用现有）
- 更新 `component-guidelines.md` 中「日期编辑 Popover」段落的描述

## Out of Scope

- `DueDateField` 暂不改造（仍用 `<input type="date">`），本次只动 `ScheduledDateField`
- 后端 `ScheduledType` 枚举 / DTO / 视图逻辑不变
- 不引入 `date-fns`（用现有 `@/lib/utils/date` 或 `react-day-picker` 内置能力）

## Requirements

### R1 月历面板
- 点 `TaskRowExpanded` 工具栏的日历图标，直接弹出月历（无需先选类型）
- 月历显示当月，可翻月（上一月 / 下一月）
- 当前 `scheduledType=DATE` 时对应日期高亮选中
- 当前 `scheduledType=SOMEDAY` 或 `NONE` 时无选中日期
- 点日历上某天 → `patch({ scheduledType: DATE, scheduledDate })`

### R2 Someday 与清除
- 面板底部有「Someday」按钮：点击 → `patch({ scheduledType: SOMEDAY })`（清掉 scheduledDate）
- 面板底部有「清除」按钮：点击 → `patch({ scheduledType: NONE, scheduledDate: null })`
- 当前为 SOMEDAY 时 Someday 按钮高亮
- 当前为 DATE / SOMEDAY 时清除按钮可用；NONE 时置灰

### R3 今天快捷
- 面板底部有「今天」按钮：点击 → `patch({ scheduledType: DATE, scheduledDate: 今天 })` 并关闭面板
- 无条件可用

### R4 主题与样式
- `Calendar` 组件使用 CSS 变量（`primary`/`primary-foreground`/`accent`/`muted-foreground`/`ring`），light/dark 均正确
- 选中日期圆角填充 `primary` 背景 + `primary-foreground` 文字
- 今日有视觉标记（如下划线 / 圆点），但不与选中态冲突

### R5 i18n
- 复用现有 `task:somedayLabel`、`common:none`
- 新增 `common:clear`（清除）；`common:today` 已存在
- 月历周名 / 月份名跟随 `i18n.language`（`react-day-picker` 的 `locale` prop）

## Acceptance Criteria

- [ ] AC1 点日历图标直接弹月历，无需先选「日期 / Someday / 无」
- [ ] AC2 点日历某天 → 任务 `scheduledType=DATE`、`scheduledDate` 为所选日，Today/Upcoming 视图可见
- [ ] AC3 点 Someday → `scheduledType=SOMEDAY`，Someday 视图可见，scheduledDate 被清掉
- [ ] AC4 点清除 → `scheduledType=NONE`、`scheduledDate=null`，任务回到 Inbox/Anytime
- [ ] AC5 点「今天」→ `scheduledType=DATE`、`scheduledDate=今天`，面板关闭，Today 视图可见
- [ ] AC6 当前 DATE 时日历对应日期高亮；当前 SOMEDAY 时 Someday 按钮高亮；当前 NONE 时无高亮、清除置灰
- [ ] AC7 light / dark 两种主题下月历样式正确（选中态、今日标记、翻月按钮）
- [ ] AC8 前端构建通过（`pnpm --filter @taskora/frontend build`）
- [ ] AC9 前端类型检查通过（`pnpm --filter @taskora/frontend typecheck`，如配置了）
- [ ] AC10 `component-guidelines.md` 日期编辑 Popover 段落已更新为月历面板描述