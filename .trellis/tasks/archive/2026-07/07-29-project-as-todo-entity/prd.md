# Project 升级为与 Task 同级的待办实体

## Goal

将 Project 从「Task 的纯容器」升级为「与 Task 同级的待办实体」：Project 保留其作为 Task 容器的身份，同时自身也能出现在 Today / Upcoming / Anytime / Someday / Logbook / Trash 等聚合视图中，与 Task 混合显示。

## Background

- 当前 `Task` 已有 `scheduledDate` / `scheduledType` / `dueDate` / `bucket` / `status` / `tags` 等字段，并据此在各聚合视图（Today/Upcoming/Anytime/Someday/Logbook/Trash）显示。
- 当前 `Project` 仅有 `title` / `notes` / `areaId` / `sortOrder`，只出现在 `/projects/:id` 详情页，不参与任何聚合视图。
- 用户希望 Project 也具备计划时间、到期时间、标签等字段，并能出现在今天/近期/随时/将来等界面。

## Requirements

### R1. Project 数据模型升级

- Project 新增字段，与 Task 对齐：
  - `status: ProjectStatus`（`ACTIVE | COMPLETED | TRASHED`，默认 `ACTIVE`）
  - `bucket: ProjectBucket`（`INBOX | ANYTIME | SCHEDULED`，默认 `INBOX`）
  - `scheduledType: ScheduledType`（复用现有枚举 `NONE | DATE | SOMEDAY`，默认 `NONE`）
  - `scheduledDate: DateTime?`（计划日期，仅 `scheduledType=DATE` 有值）
  - `dueDate: DateTime?`（到期/通知日期，仅存储，不参与 bucket/视图查询）
  - `completedAt: DateTime?`
  - `trashedAt: DateTime?`
- 新增 `ProjectTag` 关联表（`id` + `projectId` + `tagId` + `createdAt` + `@@unique([projectId, tagId])`），复用现有 `Tag` 模型。
- Project 保留现有 `tasks Task[]` 关系（容器身份不变），`Task.projectId` 不变。
- 删除 Project 时其下 Task 行为：保持现状（现有 schema 中 Task→Project 关系无 `onDelete`，实际为 `NoAction`/ restrict）——不在本次改动。

### R2. Project CRUD/行为对齐 Task

- Project 的 create/update 支持 `scheduledDate` / `scheduledType` / `dueDate` / `bucket` / `tagIds`。
- Project 复用与 Task 相同的 bucket 推导规则（`resolveBucket`）。
- Project 软删除（`status=TRASHED` + `trashedAt`）、恢复、完成（`status=COMPLETED` + `completedAt`）、撤销完成，行为与 Task 一致。
- Project 的 tagIds 采用与 Task 相同的全量 set 语义（`deleteMany` + `createMany` 事务）。

### R3. 聚合接口

- 新增聚合接口，按 `view`（inbox/today/upcoming/anytime/someday/trash/logbook）返回 Task + Project 混合数据。
- 混合条目需带类型标识（`task` / `project`），以便前端区分点击行为与渲染。
- 排序：各视图沿用 Task 现有排序规则（默认 `sortOrder asc, createdAt desc`；logbook 按 `completedAt desc`），Project 与 Task 混在同一序列排序。
- Upcoming 按日期分组；Today/Anytime/Someday/Trash/Logbook 沿用现有分组方式。

### R4. 前端聚合视图显示

- Today / Upcoming / Anytime / Someday / Logbook / Trash / Inbox 改为从聚合接口取数据，混合显示 Task 与 Project。
- Project 条目在列表中显示：标题 + 日期 badge + 标签等（与 Task 行视觉对齐）。
- 在聚合列表中点击 Project 条目 → 跳转 `/projects/:id`（不原地展开子任务）。
- Project 可在列表行内或详情页编辑 `scheduledDate` / `dueDate` / `tags` / `bucket` 等字段。

## Out of Scope

- 不改动 `Task.projectId` 关系，不改动 Project→Task 的容器语义。
- 不改动 Project 下 Task 的级联删除策略。
- 不新增 Project 的子任务展开/折叠 UI。
- 不改动现有 Task 的字段、行为与各 Task 专属页面（TagDetail 等）的 Task 显示逻辑（除非聚合视图需要）。

## Acceptance Criteria

- [ ] Schema 迁移成功：Project 新增 status/bucket/scheduledType/scheduledDate/dueDate/completedAt/trashedAt 字段，新增 ProjectTag 表；`prisma migrate dev` 生成并应用迁移无报错。
- [ ] Project create/update 接口支持新字段与 tagIds，bucket 推导与 Task 规则一致（DATE/SOMEDAY→SCHEDULED，NONE→按 project/area 降级）。
- [ ] Project 软删除/恢复/完成/撤销完成接口工作正常，与 Task 行为对齐。
- [ ] 聚合接口按各 view 返回 Task + Project 混合数据，含类型标识；排序与分组正确。
- [ ] 前端 Today/Upcoming/Anytime/Someday/Logbook/Trash/Inbox 混合显示 Task 与 Project；点击 Project 跳转 `/projects/:id`。
- [ ] Project 行内可编辑 scheduledDate/dueDate/tags/bucket，并正确反映到聚合视图。
- [ ] 现有 Task 功能回归无破坏（ProjectDetail、TagDetail、Inbox 等现有页面正常）。
- [ ] 后端类型检查与测试通过；前端 lint/build 通过。

## Notes

- 现有 `ScheduledType` / `TaskBucket` / `TaskStatus` 枚举在 `packages/shared`。Project 复用 `ScheduledType`；`bucket` 与 `status` 需决定是复用同一枚举还是新增 Project 专属枚举（见 design.md）。
- 聚合接口的数据源选择见 design.md。