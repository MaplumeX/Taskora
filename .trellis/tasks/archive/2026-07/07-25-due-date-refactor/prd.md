# Rename dueDate to scheduledDate and add new dueDate for notifications

## Goal

将 Task 模型现有的 `dueDate` 字段重命名为 `scheduledDate`（中文名"计划日期"），语义和功能不变；同时新增一个 `dueDate` 字段，用于未来通知功能。本次只做字段层面的重命名 + 新增，不实现通知发送机制。

## Background

当前 Task 有一个 `dueDate` 字段，它承担的是"计划日期"语义：决定 SCHEDULED bucket、驱动 today/upcoming 视图。随着产品演进，需要一个真正的"截止日期"用于通知触发，与"计划日期"分离。

## Confirmed Facts

- `dueDate` 当前存在于：Prisma schema (`schema.prisma:108`)、init migration SQL、shared DTO (Create/Update/Response)、backend DTO+service+controller、frontend DTO 绑定、多个页面与组件。
- `resolveBucket` 用 `dueDate` 决定是否 `SCHEDULED`：有日期即 SCHEDULED。
- `findAll` 视图查询：today = dueDate ≤ now，upcoming = dueDate > now，inbox/anytime/someday 要求 dueDate = null。
- 前端展示组件：`TaskDateBadge`（展示日期徽章）、`TaskItem`、`Trash`、`Upcoming`（按 dueDate 分组）、`TaskDetail`（日期 input）、`QuickAddTask`（dueToday 设当天日期）。
- 测试文件 `tasks.service.tags.spec.ts` 构造了含 `dueDate: null` 的 existingTask fixture。

## Requirements

### R1 · 字段重命名 dueDate → scheduledDate
- Prisma schema 列名 `dueDate` → `scheduledDate`，类型不变（DateTime?）。
- 新增 Prisma migration，把现有列 `dueDate` 重命名为 `scheduledDate`并迁移数据。
- backend `TasksService.resolveBucket` / `create` / `findAll` / `update` 中所有 `dueDate` → `scheduledDate`。
- backend DTO（Create/Update/Response/TaskQueryDto）字段名同步。
- shared DTO 字段名同步。
- frontend 所有引用同步（组件、页面、api、hooks、types）。
- 测试 fixture 同步。

### R2 · 新增 dueDate 字段（通知日期）
- Prisma schema 新增 `dueDate DateTime?` 列，默认 null。
- migration 中新列初始值为 null（不拷贝 scheduledDate）。
- 新 `dueDate` **不参与** `resolveBucket`、不参与任何 view 查询条件，仅作为存储字段 + CRUD 可读写。
- backend DTO 增加可选 `dueDate`（ISO 8601 string | null）。
- shared DTO 同步。
- frontend TaskDetail 暂不提供编辑入口（本次范围只做数据层与 DTO）。前端是否展示新 dueDate 留待通知功能时再决定。

### R3 · 数据迁移
- migration 将旧 `dueDate` 列重命名为 `scheduledDate`，保留全部历史数据。
- 新 `dueDate` 列对所有现有行置 null。

## Acceptance Criteria

- [ ] `npx prisma migrate dev` 成功生成并应用迁移；schema 中 `Task.scheduledDate` 存在，`Task.dueDate` 存在且可为 null。
- [ ] backend `TasksService` 中所有使用 `scheduledDate` 代替旧 `dueDate`；新 `dueDate` 仅被 create/update 写入、不在 view 查询中使用。
- [ ] 创建任务时传 `scheduledDate` → bucket 解析为 SCHEDULED；传新 `dueDate` → bucket 不受其影响。
- [ ] today 视图按 `scheduledDate ≤ now` 过滤；upcoming 按 `scheduledDate > now` 过滤；inbox/anytime/someday 要求 `scheduledDate = null`。
- [ ] 更新任务的 `scheduledDate` 会触发 bucket 重新解析；更新新 `dueDate` 不触发 bucket 变化。
- [ ] shared/backend/frontend 全量类型检查通过（`pnpm -r typecheck` 或等价命令）。
- [ ] 既有测试 `tasks.service.tags.spec.ts` fixture 更新为 `scheduledDate`，测试通过。
- [ ] 前端构建通过；inbox/today/upcoming/anytime/someday/trash 页面行为与改动前一致。

## Out of Scope

- 通知发送机制（推送/邮件/in-app）的实现。
- 前端新 `dueDate` 的编辑 UI 或展示 UI。
- 对历史数据做任何"计划日期 → 通知日期"的拷贝（新 dueDate 一律置 null）。
- 通知相关的 scheduled job / cron。

## Open Questions

无（所有产品决策已在 brainstorm 阶段确认）。