# PRD: 编辑任务时设置到期时间

## Goal / User Value

用户在编辑任务时能设置到期时间（`dueDate` 字段），并在任务列表行上看到到期时间徽章，便于识别哪些任务即将到期或已逾期。

## Background / Confirmed Facts

- 后端已完整支持 `dueDate`：
  - `prisma/schema.prisma:114` — `dueDate DateTime?`
  - `packages/backend/src/tasks/tasks.service.ts:212-213` — update 方法已处理 `dto.dueDate`
  - `packages/shared/src/dtos/task.dto.ts` — `CreateTaskDto.dueDate`、`UpdateTaskDto.dueDate`、`TaskResponseDto.dueDate` 均已定义
- 前端缺失：
  - `TaskRowExpanded.tsx` 编辑面板只有「计划日期 / 项目 / 区域 / 标签」入口，无 `dueDate` 编辑入口
  - `TaskItem.tsx` 任务行只渲染 `TaskDateBadge`（计划日期徽章），无 `dueDate` 展示
- `dueDate` 与 `scheduledDate` 是两个语义不同的字段：
  - `scheduledDate` — 计划日期（已有）
  - `dueDate` — 到期/通知日期（本任务要补 UI）
- 日期工具函数 `toInputDateValue` / `fromInputDateValue` / `formatDateLabel` / `isOverdue` / `isToday` 已存在，可直接复用

## Requirements

### R1: 编辑面板新增到期时间入口

- 在 `TaskRowExpanded.tsx` 的工具栏中新增一个 Popover 入口用于设置 `dueDate`
- 使用 `<input type="date">` 选择日期（只精确到日，与现有计划日期一致）
- 清空日期输入框时，将 `dueDate` 置为 `null`
- 与现有「计划日期」入口并列，使用不同图标区分

### R2: 任务行显示到期时间徽章

- 在 `TaskItem.tsx` 任务行展示 `dueDate` 徽章
- 复用 `formatDateLabel` / `isOverdue` / `isToday` 逻辑，样式与计划日期徽章一致（今天/逾期显示红色）
- 使用与计划日期徽章不同的图标，便于用户区分两个日期

### R3: 前端 i18n / 文案

- Popover label 使用「到期」
- 其余沿用现有文案体系，不新增翻译机制

## Acceptance Criteria

- [ ] AC1: 在任务编辑面板点击「到期」图标弹出日期选择器，选择日期后 `dueDate` 保存成功（网络请求 200，刷新后值保留）
- [ ] AC2: 清空日期输入框后 `dueDate` 被置为 `null`（网络请求 200，刷新后为空）
- [ ] AC3: 任务列表行的 `dueDate` 徽章正确显示日期标签（今天 / 明天 / 周X / X月X日）
- [ ] AC4: 当 `dueDate` 为今天或已逾期时，徽章显示为红色（`#CC4444`）
- [ ] AC5: `dueDate` 与 `scheduledDate` 徽章视觉可区分（使用不同图标）
- [ ] AC6: `dueDate` 为 `null` 时不渲染徽章

## Out of Scope

- 后端字段/接口变更（后端已具备完整支持）
- 到期时间提醒/通知功能（仅 UI 编辑与展示）
- 到期时间精确到时分
- 创建任务时设置 `dueDate`（QuickAddTask 暂不处理）

## Key Decisions

- 到期徽章图标使用 `Clock`（计划日期用 `Calendar`），视觉上区分两个日期语义
- 编辑面板复用现有 `IconPopover` 组件，与计划日期入口并列
- 徽章复用 `TaskDateBadge` 的样式，但使用独立组件 `TaskDueDateBadge` 以承载不同图标

## Open Questions

（无 — 所有决策已明确）