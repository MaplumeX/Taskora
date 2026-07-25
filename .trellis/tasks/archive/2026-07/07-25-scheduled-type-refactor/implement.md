# Implement: scheduledType field and Someday as view refactor

## 执行清单（按依赖顺序）

### 1. shared 层

- [ ] `packages/shared/src/enums/task.enum.ts`
  - 删除 `TaskBucket.SOMEDAY`
  - 新增 `enum ScheduledType { NONE='NONE', DATE='DATE', SOMEDAY='SOMEDAY' }`
- [ ] `packages/shared/src/dtos/task.dto.ts`
  - `CreateTaskDto.scheduledType?: ScheduledType`
  - `UpdateTaskDto.scheduledType?: ScheduledType | null`
  - `TaskResponseDto.scheduledType: ScheduledType`
- [ ] 构建 shared：`pnpm --filter @taskora/shared build`

### 2. Prisma schema

- [ ] `packages/backend/prisma/schema.prisma`
  - `enum TaskBucket` 删除 `SOMEDAY`
  - 新增 `enum ScheduledType { NONE DATE SOMEDAY }`
  - `model Task` 新增 `scheduledType ScheduledType @default(NONE)`
- [ ] 生成 migration：`cd packages/backend && pnpm prisma migrate dev --name scheduled-type`
  - 开发期允许 reset：若 `migrate dev` 报怨 enum 值删除阻塞，用 `prisma migrate reset`

### 3. backend DTO

- [ ] `packages/backend/src/tasks/dto/tasks.dto.ts`
  - import `ScheduledType`
  - `CreateTaskDto`：新增 `@IsOptional() @IsEnum(ScheduledType) scheduledType?: ScheduledType`
  - `UpdateTaskDto`：新增同上（UpdateDto 不接受 null，省略即不变）
  - `TaskQueryDto.view` 的 @IsEnum 列表保持不变（view 值不变）

### 4. backend service

- [ ] `packages/backend/src/tasks/tasks.service.ts`
  - import `ScheduledType`
  - 重写 `resolveBucket` 签名为 `(bucket, scheduledType, projectId, areaId)`，按 design.md 的逻辑
  - `create`：读取 `dto.scheduledType ?? ScheduledType.NONE`；若 SOMEDAY 则 scheduledDate=null；调用新 resolveBucket
  - `findAll`：按 design.md 重写各 view 分支
  - `update`：检测 `dto.scheduledType` 变化时级联维护 scheduledDate 与 bucket（见 design.md「update 逻辑」）

### 5. seed & 测试修正

- [ ] `packages/backend/prisma/seed.ts`：把 `bucket: TaskBucket.SOMEDAY` 改为 `scheduledType: ScheduledType.SOMEDAY`（配合 bucket=ANYTIME 或 INBOX，由 resolveBucket 推导）
- [ ] `packages/backend/test/tasks.service.tags.spec.ts`：将 `bucket: TaskBucket.SOMEDAY` 用例改为不再使用 SOMEDAY（如改 INBOX 或 ANYTIME），或加 scheduledType
- [ ] `packages/backend/test/tasks.service.logbook.spec.ts`：同上
- [ ] 运行测试：`cd packages/backend && pnpm test`

### 6. 前端

- [ ] `packages/frontend/src/lib/api/tasks.api.ts`：保持 `TaskView` 不变（仍含 'someday'）
- [ ] `packages/frontend/src/components/task/QuickAddTask.tsx`
  - 删除 `defaultBucket?: TaskBucket` prop
  - 新增 `scheduledType?: ScheduledType`
  - 在 `dueToday` 分支同时设 `scheduledType: 'DATE'`
- [ ] `packages/frontend/src/pages/Someday.tsx`：QuickAddTask 改传 `scheduledType='SOMEDAY'`，删除 defaultBucket
- [ ] `packages/frontend/src/pages/Inbox.tsx`：QuickAddTask 删除 `defaultBucket`（默认走 INBOX 推导）
- [ ] `packages/frontend/src/components/task/TaskDetail.tsx`
  - 日期区扩展为 segmented 控件：None / Soon(日期) / Someday
  - patch 时按 design.md 的语义调用
- [ ] 前端构建：`pnpm --filter @taskora/frontend build`

### 7. 端到端验证

- [ ] 启动 dev 服务，从 Someday 页面 QuickAdd 创建任务 → 在 Someday view 看到它
- [ ] 在 TaskDetail 切 Someday → DATE（选日期）→ 出现在 Today/Upcoming
- [ ] DATE → NONE → 出现在 Inbox 或 Anytime（取决于 project/area）
- [ ] Inbox/Anytime 页面不再显示 SCHEDULED 状态的任务

## 验证命令

```bash
# shared build
pnpm --filter @taskora/shared build

# backend test
cd packages/backend && pnpm test

# backend lint / compile
cd packages/backend && pnpm build

# frontend build
pnpm --filter @taskora/frontend build

# prisma 校验
cd packages/backend && pnpm prisma validate
```

## 风险文件与回滚点

- `packages/backend/prisma/schema.prisma` — 删除 enum 值，PG 可能阻塞 → 开发期 reset
- `packages/backend/src/tasks/tasks.service.ts` — resolveBucket 与 update 的级联，是本次最易出 bug 的地方
- 回滚：每步可独立 git revert；migration reset 即可重置 schema

## Review Gates

1. shared 构建通过且类型正确（手测 dtos 导出）
2. backend 单测全绿
3. 前端 build 通过
4. 手动端到端验证四步流转