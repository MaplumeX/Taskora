# Implement: 独立 Subtask 表重构

## 执行顺序

总原则：**后端 schema → 后端 service/controller → shared DTO → 前端**。每步可独立验证。

---

### Step 1: Schema + Migration

- [ ] 在 `schema.prisma` 新增 `Subtask` 模型
- [ ] 在 `Task` 模型移除 `parentId` / `parent` / `children`，新增 `subtasks Subtask[]`
- [ ] 运行 `pnpm --filter backend prisma migrate dev --name subtask_own_table`
- [ ] 验证：`prisma generate` 成功，migration SQL 检查无误

**验证命令**：
```bash
cd packages/backend && pnpm prisma migrate dev --name subtask_own_table
```

**回滚点**：`prisma migrate rollback`，恢复 schema.prisma 到改动前

---

### Step 2: Shared DTOs

- [ ] 新建 `packages/shared/src/dtos/subtask.dto.ts`（CreateSubtaskDto / UpdateSubtaskDto / SubtaskResponseDto / ReorderSubtasksDto）
- [ ] 更新 `task.dto.ts`：移除 CreateTaskDto.parentId / UpdateTaskDto.parentId / TaskQueryDto.parentId / TaskResponseDto.parentId+children，新增 TaskResponseDto.subtasks
- [ ] 更新 `feed.dto.ts`：移除 TaskFeedItem.parentId
- [ ] 确认 `shared/index.ts` 导出新 DTO

**验证命令**：
```bash
pnpm --filter shared build
```

---

### Step 3: 后端 SubtasksService + SubtasksController

- [ ] 新建 `packages/backend/src/subtasks/subtasks.module.ts`
- [ ] 新建 `packages/backend/src/subtasks/subtasks.controller.ts`（6 个端点）
- [ ] 新建 `packages/backend/src/subtasks/subtasks.service.ts`
- [ ] 新建 `packages/backend/src/subtasks/dto/subtasks.dto.ts`（class-validator 版本）
- [ ] 在 `app.module.ts` 注册 SubtasksModule

**验证命令**：
```bash
pnpm --filter backend build
```

---

### Step 4: 后端 TasksService 精简

- [ ] `create`：移除 parentId 入参与 resolveBucket 相关逻辑
- [ ] `findAll`：移除 parentId query 分支
- [ ] `findOne`：include 改为 `{ subtasks: { orderBy: { sortOrder: 'asc' } }, tags: ... }`
- [ ] `update`：移除 parentId / heading disconnect 逻辑
- [ ] `remove` / `restore`：移除 BFS，仅软删/恢复 task 本身
- [ ] `convertToProject`：读取 subtasks → 为每条创建新 project 下的 Task → 删除原 task（Subtask CASCADE）

**验证命令**：
```bash
pnpm --filter backend build
```

---

### Step 5: 后端 FeedService + ProjectHeadingsService 精简

- [ ] `feed.service.emptyTrash`：移除 parentId BFS 后代收集
- [ ] `feed.service.findAll`：TaskFeedItem 映射移除 parentId
- [ ] `project-headings.service.reorder`：移除 3 处 `parentId: null` 过滤
- [ ] `project-headings.service.remove`：移除 parentId BFS 后代收集

**验证命令**：
```bash
pnpm --filter backend build
```

---

### Step 6: 后端测试更新

- [ ] `tasks.service.create.spec.ts`：移除 parentId 相关用例
- [ ] `tasks.service.trash-cascade.spec.ts`：移除 BFS 级联用例或改为验证 Subtask CASCADE
- [ ] `tasks.service.heading-invariant.spec.ts`：适配 parentId 移除
- [ ] 其他 spec 检查并适配

**验证命令**：
```bash
pnpm --filter backend test
```

---

### Step 7: 前端 API + Hooks

- [ ] `tasks.api.ts`：新增 subtask API 函数，移除 TaskQuery.parentId
- [ ] `useTasks.ts`：新增 subtask hooks，useCreateTask 不再传 parentId
- [ ] 验证类型：`pnpm --filter frontend build`（tsc）

---

### Step 8: 前端组件适配

- [ ] `TaskRowExpanded.tsx`：addSubtask / SubtaskRow 适配 SubtaskResponseDto 和新 hooks
- [ ] `FeedListView.tsx`：移除 `!parentId` 过滤
- [ ] `ProjectTaskLayout.tsx`：移除 `!task.parentId` 过滤和 parentId map
- [ ] 更新测试：`TaskRowExpanded.test.tsx` / `ProjectTaskLayout.test.tsx`

**验证命令**：
```bash
pnpm --filter frontend build && pnpm --filter frontend test
```

---

### Step 9: 全量验证

- [ ] `pnpm build`（全 monorepo）
- [ ] `pnpm test`（全 monorepo）
- [ ] 手动验证：创建任务 → 添加子任务 → 勾选 → 删除 → 恢复父任务 → 子任务仍在

**验证命令**：
```bash
pnpm -r build && pnpm -r test
```

---

## Review Gates

- Step 1 后：检查 migration SQL
- Step 6 后：后端测试全绿
- Step 9 后：全量构建和测试通过

## Rollback Points

- Step 1 后：`prisma migrate rollback`
- 任何代码步骤后：`git checkout -- <files>`
