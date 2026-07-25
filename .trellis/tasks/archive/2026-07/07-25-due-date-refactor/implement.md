# Implement — dueDate refactoring

## Ordered Checklist

### Step 1 · shared DTO 层
- [ ] `packages/shared/src/dtos/task.dto.ts`：
  - CreateTaskDto: `dueDate?` → `scheduledDate?`，新增 `dueDate?`（string，ISO 8601）
  - UpdateTaskDto: `dueDate?` → `scheduledDate?`，新增 `dueDate?`（string | null）
  - TaskResponseDto: `dueDate` → `scheduledDate`，新增 `dueDate: string | null`

### Step 2 · Prisma schema + migration
- [ ] `packages/backend/prisma/schema.prisma`：
  - `Task.dueDate` → `scheduledDate DateTime?`
  - 新增 `dueDate DateTime?`
- [ ] 生成迁移：`pnpm --filter backend exec prisma migrate dev --create-only --name rename_dueDate_to_scheduledDate_add_new_dueDate`
- [ ] **手工核对**生成的 SQL：必须是 `ALTER TABLE "Task" RENAME COLUMN "dueDate" TO "scheduledDate";` + `ALTER TABLE "Task" ADD COLUMN "dueDate" TIMESTAMP(3);`，不得是 DROP + ADD（会丢数据）。如不对，手工修正。
- [ ] 应用迁移：`pnpm --filter backend exec prisma migrate dev`
- [ ] 重新生成 Prisma Client：`pnpm --filter backend exec prisma generate`

### Step 3 · backend DTO + service
- [ ] `packages/backend/src/tasks/dto/tasks.dto.ts`：
  - CreateTaskDto: `dueDate` → `scheduledDate`，新增 `dueDate`（@IsOptional @IsDateString）
  - UpdateTaskDto: 同上（`string | null`）
- [ ] `packages/backend/src/tasks/tasks.service.ts`：
  - `resolveBucket` 参数 `dueDate` → `scheduledDate`
  - `create`: `dto.dueDate` → `dto.scheduledDate`；新增 `dueDate` 写入
  - `findAll`: 所有 `where.dueDate` → `where.scheduledDate`
  - `update`: `dto.scheduledDate` 触发 resolveBucket；`dto.dueDate` 仅写入。`existing.dueDate` → `existing.scheduledDate` 用于派生。新 `dueDate` 写入逻辑独立。
  - 注：`resolveBucket` 内仍只看 `scheduledDate`，新 `dueDate` 不传入。

### Step 4 · backend test fixture
- [ ] `packages/backend/test/tasks.service.tags.spec.ts`：fixture `existingTask.dueDate: null` → `scheduledDate: null`（新 dueDate 不需要写或可选）

### Step 5 · frontend 全量替换
- [ ] `frontend/src/components/task/TaskDateBadge.tsx`：prop `dueDate` → `scheduledDate`
- [ ] `frontend/src/components/task/TaskItem.tsx`：`task.dueDate` → `task.scheduledDate`
- [ ] `frontend/src/components/task/QuickAddTask.tsx`：`payload.dueDate` → `payload.scheduledDate`；注释 `dueDate` → `scheduledDate`
- [ ] `frontend/src/components/task/TaskDetail.tsx`：`current.dueDate` → `current.scheduledDate`；`patch({ dueDate })` → `patch({ scheduledDate })`
- [ ] `frontend/src/pages/Upcoming.tsx`：`t.dueDate` → `t.scheduledDate`
- [ ] `frontend/src/pages/Trash.tsx`：`task.dueDate` → `task.scheduledDate`
- [ ] 全局搜索确认无遗漏：`grep -rn "dueDate" packages/frontend/src` 应只剩类型定义里的新 `dueDate`（DTO 来源）。

### Step 6 · 验证
- [ ] `pnpm -r typecheck` 通过
- [ ] `pnpm --filter backend test` 通过（tags spec）
- [ ] `pnpm --filter backend test` logbook spec 通过（如有用到 dueDate）
- [ ] `pnpm --filter backend build` 通过
- [ ] `pnpm --filter frontend build` 通过
- [ ] 手动或脚本验证：创建任务带 `scheduledDate` → bucket=SCHEDULED；创建任务带新 `dueDate` 但无 scheduledDate → bucket=INBOX（不受 dueDate 影响）

## Validation Commands

```bash
# 类型检查
pnpm -r typecheck

# 后端测试
pnpm --filter backend test

# 后端构建
pnpm --filter backend build

# 前端构建
pnpm --filter frontend build

# Prisma 迁移核对
pnpm --filter backend exec prisma migrate status
```

## Risky Files / Rollback Points

| 文件 | 风险 |
|------|------|
| `prisma/migrations/<new>/migration.sql` | 必须 RENAME 而非 DROP+ADD；核对后才能应用 |
| `tasks.service.ts` `resolveBucket` + `update` | bucket 重算条件易漏；新 dueDate 绝不能进 resolveBucket |
| `TaskDetail.tsx` | 日期 input 的 patch 字段名要从 `dueDate` 改为 `scheduledDate`，否则更新到新 dueDate（错误语义） |

## Review Gates

- migration SQL 核对（step 2）是硬性前置门：应用前必须确认 RENAME COLUMN。
- step 5 完成后 grep 确认 frontend 无遗漏的旧 `dueDate` 引用（除 DTO 新字段外）。