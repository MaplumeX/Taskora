# Implement — Project 升级为与 Task 同级的待办实体

## 执行顺序

按依赖顺序：DB → shared DTO → 后端服务 → 聚合接口 → 前端 API/hooks → 前端组件/页面。

---

## Step 1. Schema 与迁移

- [ ] 在 `packages/backend/prisma/schema.prisma`：
  - 新增 `enum ProjectStatus`、`enum ProjectBucket`。
  - Project 模型新增 `status/bucket/scheduledType/scheduledDate/dueDate/completedAt/trashedAt` 字段 + `tags ProjectTag[]`。
  - 新增 `model ProjectTag`（含 `@@unique([projectId, tagId])` + 索引）。
  - `Tag` 模型补 `projects ProjectTag[]`。
- [ ] 运行 `cd packages/backend && pnpm prisma migrate dev --name project_as_todo_entity`，确认迁移成功。
- [ ] 运行 `pnpm prisma generate`（或 build）确认 Prisma Client 类型更新。

**验证**：`pnpm prisma migrate status` 无 pending；Prisma Client 可识别新字段。

**回滚点**：迁移失败则 `prisma migrate reset`（开发环境）或手写 down SQL。

---

## Step 2. shared 枚举与 DTO

- [ ] 新增 `packages/shared/src/enums/project.enum.ts`（`ProjectStatus`、`ProjectBucket`）。
- [ ] `packages/shared/src/index.ts` 导出新枚举。
- [ ] 更新 `packages/shared/src/dtos/project.dto.ts`：Create/Update/Response 加新字段 + tagIds。
- [ ] 新增 `packages/shared/src/dtos/feed.dto.ts`（`FeedItem` / `TaskFeedItem` / `ProjectFeedItem` / `FeedItemType`）。
- [ ] `index.ts` 导出 feed DTO。
- [ ] 构建 shared：`cd packages/shared && pnpm build`（或 tsc）通过。

**验证**：`pnpm -F @taskora/shared build` 无报错。

---

## Step 3. ProjectsService 升级

- [ ] `packages/backend/src/projects/dto/projects.dto.ts`：CreateProjectDto/UpdateProjectDto 加新字段 + tagIds（class-validator 装饰器，参照 Task DTO）。
- [ ] `projects.service.ts`：
  - 引入 `resolveBucket`（Project 版：无 parentId/projectId）。
  - `create` 支持 scheduledDate/scheduledType/dueDate/bucket + tagIds nested create。
  - `update` 支持 scheduledType 级联 scheduledDate、重算 bucket、tagIds 全量 set 事务。
  - `findAll`/`findOne` include tags + map。
  - `remove` 改为软删除（status=TRASHED + trashedAt）。
  - 新增 `restore` / `complete` / `uncomplete`。
- [ ] `projects.controller.ts`：新增 `POST :id/restore`、`POST :id/complete`、`POST :id/uncomplete`；`DELETE :id` 行为注释为软删除。
- [ ] 更新 `projects.module.ts`（无需改动则跳过）。

**验证**：`cd packages/backend && pnpm build` 通过；手动/接口测试 create+update+tagIds。

**回滚点**：service 改动可 git revert，不影响已应用的 schema 迁移。

---

## Step 4. 抽取 view→where 共享逻辑

- [ ] 在 `packages/backend/src/tasks/` 新增 `views.ts`，导出 `buildTaskViewWhere(view, userId): Prisma.TaskWhereInput`（从 TasksService.findAll 抽取 view 分支）。
- [ ] TasksService.findAll 改为调用 `buildTaskViewWhere`（保持原行为不变）。
- [ ] 新增 `packages/backend/src/projects/views.ts`，`buildProjectViewWhere(view, userId): Prisma.ProjectWhereInput`（同语义映射到 Project）。

**验证**：后端 build 通过；现有 `GET /tasks?view=...` 行为不变（回归）。

---

## Step 5. 聚合接口 FeedModule

- [ ] 新增 `packages/backend/src/feed/feed.module.ts` / `feed.controller.ts` / `feed.service.ts` / `dto/feed.dto.ts`（FeedQueryDto，复用 view 联合类型）。
- [ ] `FeedService.findAll(userId, view)`：`Promise.all` 取 task + project，map 成 FeedItem，合并排序。
- [ ] `FeedController`：`GET /feed?view=...`，JwtAuthGuard。
- [ ] `app.module.ts` 注册 FeedModule。

**验证**：`pnpm -F @taskora/backend build` 通过；`GET /feed?view=today` 返回混合数组含 `type` 字段。

---

## Step 6. 前端 API / hooks

- [ ] `lib/api/feed.api.ts`：`getFeed(view)` + `FeedView` 类型（复用后端 view 集合）。
- [ ] `lib/api/projects.api.ts`：扩展 create/update 入参；新增 restore/complete/uncomplete。
- [ ] `lib/hooks/useFeed.ts`：`useFeedQuery(view)` + `feedKeys`。
- [ ] `lib/hooks/useProjects.ts`：补 restore/complete/uncomplete mutation；所有 mutation onSuccess invalidate `['feed']` 与 `projectKeys.all`。
- [ ] `lib/hooks/useTasks.ts`：mutation onSuccess 追加 invalidate `['feed']`。

**验证**：`pnpm -F @taskora/frontend build`（或 lint）通过。

---

## Step 7. 前端聚合组件

- [ ] 新增 `components/feed/FeedItemRow.tsx`：按 `item.type` 分发：
  - `task` → 复用 `TaskItem`（TaskFeedItem 断言为 TaskResponseDto；补缺失字段默认值）。
  - `project` → 新建 `components/feed/ProjectFeedRow.tsx`（标题 + TaskDateBadge + TaskDueDateBadge + 标签圆点；点击 `navigate('/projects/:id')`）。
- [ ] 新增 `components/feed/FeedListView.tsx`：接收 `FeedItem[]`，渲染列表（复用 useTaskRowSelection 逻辑，支持 selected/expanded，但 project 行不展开）。
- [ ] 检查 TaskItem 对 TaskResponseDto 字段依赖（`children`? `parentId`? `status`? `tags`?），TaskFeedItem 断言前补默认。

**验证**：组件可渲染 mock FeedItem[]；点击 project 跳转。

---

## Step 8. 前端页面切换到聚合数据源

- [ ] Today.tsx：`useTasksQuery({view:'today'})` → `useFeedQuery('today')`，渲染 `FeedListView`。
- [ ] Upcoming.tsx：同上，分组逻辑改 FeedItem。
- [ ] Anytime.tsx / Someday.tsx / Inbox.tsx：同上。
- [ ] Logbook.tsx：分组（today/yesterday/earlier）改 FeedItem。
- [ ] Trash.tsx：渲染 FeedItem（task + project）。
- [ ] 移除/保留原 `useTasksQuery({view})` 调用：ProjectDetail 等仍按 projectId 拉纯 task 列表（保留 `GET /tasks?projectId=`）。

**验证**：各页面 build 通过；手动验证混合显示。

---

## Step 9. ProjectDetail 字段编辑

- [ ] ProjectDetail.tsx 增加 scheduledDate/dueDate/tags/bucket 编辑区（复用 ScheduledDateField/DueDateField/TagsField，但 onPatch 调用 `updateProject`）。
- [ ] 验证编辑后聚合视图更新。

**验证**：详情页编辑生效，聚合视图刷新。

---

## Step 10. 全量回归与质量检查

- [ ] 后端：`pnpm -F @taskora/backend build` + 现有测试通过。
- [ ] 前端：`pnpm -F @taskora/frontend lint` + `build` 通过；`pnpm test`（vitest）通过。
- [ ] 端到端手动：创建 Project → 设 scheduledDate today → 出现在 Today → 点击跳转详情 → 编辑 tags → 标签 badge 出现 → 软删除 → 出现在 Trash → 恢复。
- [ ] Task 回归：原有 Today/Upcoming/Anytime/Someday/Logbook/Trash/Inbox 的 Task 行为不破坏。

**验证命令**：
```bash
cd packages/backend && pnpm build && pnpm test
cd packages/frontend && pnpm lint && pnpm build && pnpm test
```

---

## Review Gates

- Step 1 后：确认迁移应用成功。
- Step 5 后：聚合接口返回结构正确。
- Step 8 后：前端各视图混合显示正确。
- Step 10：全量回归通过后进入 Phase 3（spec 更新 + commit）。

## Rollback Points

- Step 1 失败：`prisma migrate reset`（dev）。
- Step 3-9 失败：git revert 对应 commit，schema 迁移保留或单独 down。
- 整体回滚：保留 schema 迁移（向后兼容），仅回滚代码。