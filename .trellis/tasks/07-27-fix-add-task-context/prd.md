# 修复各界面添加任务按钮的上下文归属

## 背景

当前"添加任务"按钮全局挂在 `AppShell` 的 `ContentBottomBar.tsx`，点击后通过 `usePageTaskContext()` 根据路由推断 `CreateTaskDto` 上下文，立即创建一个空标题任务并展开行内编辑。

问题：`usePageTaskContext.ts` 的路由→上下文映射只覆盖了 `/today`、`/someday`、`/projects/:id` 三个路由，其余路由一律返回空上下文 `{}`。后端 `TasksService.resolveBucket` 在无上下文时默认落 `INBOX`，导致在 `/upcoming`、`/anytime`、`/areas/:id`、`/tags/:tagId` 等页面点击"添加任务"后，新建的任务不会出现在当前列表中。

## 问题清单

| 页面 | 期望落入 | 当前行为 | 状态 |
|---|---|---|---|
| `/inbox` | INBOX | bucket=INBOX（默认兜底） | ✓ 碰巧正确 |
| `/today` | SCHEDULED + 今天 DATE | 已带 DATE + today | ✓ 已正确 |
| `/upcoming` | SCHEDULED + 未来 DATE | 无上下文 → INBOX | ❌ 任务进了收件箱 |
| `/anytime` | ANYTIME + NONE | 无上下文 → INBOX | ❌ 任务进了收件箱 |
| `/someday` | SCHEDULED + SOMEDAY | 已带 SOMEDAY | ✓ 已正确 |
| `/projects/:id` | projectId | 已带 projectId | ✓ 已正确 |
| `/areas/:id` | areaId | 无上下文 | ❌ 任务不归属该 Area，列表里看不到 |
| `/tags/:tagId` | tagIds=[tagId] | 无上下文，且后端 CreateTaskDto 不支持 tagIds | ❌ 任务不带 tag，标签详情页看不到 |
| `/logbook` | (语义上不应添加) | 无上下文 → 创建 ACTIVE 任务到 INBOX | ⚠️ 语义混乱 |
| `/trash` | (语义上不应添加) | 无上下文 → 创建 ACTIVE 任务到 INBOX | ⚠️ 语义混乱 |

## 需求

### R1. `/upcoming` 隐藏添加任务按钮

Upcoming 列表过滤条件是 `scheduledType=DATE` 且 `scheduledDate > now`。如果允许在 Upcoming 页面直接添加任务，新建任务的 `scheduledDate` 必须严格大于当前时刻才会在列表中显示，但这会产生「默认日期」的产品决策问题。

用户确认：与 `/logbook`、`/trash` 一致，在 `/upcoming` **隐藏**添加任务按钮。用户可从 `/today` 或其他页面添加任务后在展开行内修改日期使其进入 Upcoming。

> 取消原先「设默认日期为明天」的方案。

### R2. 修复 `/anytime` 上下文
新建任务 `bucket=ANYTIME`、`scheduledType=NONE`，使其出现在 Anytime 列表。

- 后端 `resolveBucket` 在 `scheduledType=NONE` 时若没有显式 `bucket` 也没有 `projectId/areaId` → 默认 `INBOX`。因此前端必须显式传 `bucket: TaskBucket.ANYTIME`。

### R3. 修复 `/areas/:id` 上下文
新建任务须带 `areaId=params.id`。后端 `resolveBucket` 在 `scheduledType=NONE` 且有 `areaId` 时会自动落到 `ANYTIME` — 符合预期，不需前端显式传 bucket。

### R4. 修复 `/tags/:tagId` 上下文
新建任务须带 `tagIds=[tagId]`，使其出现在标签详情页。

- 当前后端 `CreateTaskDto` 与 shared `CreateTaskDto` 都**不支持** `tagIds` 字段（只有 `UpdateTaskDto` 有）。
- 需要在 shared DTO、后端 DTO 验证、`tasks.service.ts create()` 三个地方加 `tagIds` 支持。
- `create()` 复用 `update()` 的"先删旧关联再建新关联"事务模式（但 create 时没有旧关联，直接 createMany 即可）。

### R5. `/upcoming`、`/logbook`、`/trash` 隐藏添加任务按钮

用户确认：在这三个界面**隐藏**添加任务按钮（方案 A），保留搜索按钮。理由：
- `/logbook`：已完成任务归档，不应添加新任务
- `/trash`：已删除任务，不应添加新任务
- `/upcoming`：未来日期列表，添加任务需要额外的默认日期决策，暂不支持直接添加

### R6. 扩展 `usePageTaskContext` 返回类型
当前返回类型是 `Partial<Pick<CreateTaskDto, 'scheduledType' | 'scheduledDate' | 'projectId'>>`，不足以表达 `bucket`、`areaId`、`tagIds`。需扩展返回类型为 `Partial<CreateTaskDto>`（去掉 `title` 字段，因为 title 始终由 `ContentBottomBar` 设为 `''`）。

## 约束

- 不改变现有 `ContentBottomBar` 的交互模式（点击立即创建空标题任务 + 展开编辑）。
- 不改变 `AppShell` 全局挂载按钮的架构（每个页面单独加按钮不在本次范围内）。
- 后端 `resolveBucket` 逻辑不变，只动 DTO 与 `create()`。
- 不引入新的页面、新的路由、新的组件层级。

## 验收标准

- [ ] AC1: `/upcoming` 页面不显示"添加任务"按钮（搜索按钮保留）。
- [ ] AC2: 在 `/anytime` 点"添加任务"，新建任务出现在 Anytime 列表（`bucket=ANYTIME`、`scheduledType=NONE`）。
- [ ] AC3: 在 `/areas/:id` 点"添加任务"，新建任务带对应 `areaId` 且出现在该 Area 详情页任务列表。
- [ ] AC4: 在 `/tags/:tagId` 点"添加任务"，新建任务带对应 `tagId` 且出现在该标签详情页任务列表。
- [ ] AC5: `/inbox`、`/today`、`/someday`、`/projects/:id` 四个已正常工作的页面行为不回归。
- [ ] AC6: `usePageTaskContext` 返回类型扩展为 `Omit<Partial<CreateTaskDto>, 'title'>`。
- [ ] AC7: 后端 `CreateTaskDto` 与 shared `CreateTaskDto` 同步新增 `tagIds?: string[]`，`tasks.service.ts create()` 正确处理 `tagIds`（建关联、返回带 tags 的结果）。
- [ ] AC8: `/logbook` 与 `/trash` 页面不显示"添加任务"按钮（搜索按钮保留）。

## 范围

- 前端：`usePageTaskContext.ts`、`ContentBottomBar.tsx`、shared DTO
- 后端：`CreateTaskDto`（shared + backend）、`tasks.service.ts` `create()`
- 不在范围：每页独立添加按钮、新页面/新路由、`TasksController` 签名变更
