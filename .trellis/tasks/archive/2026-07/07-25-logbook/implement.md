# Logbook — 执行计划

依赖 `test-infra` 完成后开始。改动量小，步骤精简。

### Step 1: 后端 view 扩展

- [ ] `packages/shared/src/dtos/task.dto.ts`：`TaskQueryDto.view` 类型加 `'logbook'`（如有 interface 版 query DTO）
- [ ] `packages/backend/src/tasks/dto/tasks.dto.ts`：`TaskQueryDto.view` 的 `@IsEnum` 加 `'logbook'`
- [ ] `packages/backend/src/tasks/tasks.service.ts`：
  - `findAll` view switch 加 `case 'logbook'`：`where.status = TaskStatus.COMPLETED`
  - 重构 orderBy：在 findMany 前根据 `query.view === 'logbook'` 决定 `[{ completedAt: 'desc' }]` vs 现有 `[{ sortOrder: 'asc' }, { createdAt: 'desc' }]`
- [ ] `pnpm --filter @taskora/shared build`

**验证**：`pnpm --filter @taskora/backend typecheck` 通过；curl `GET /tasks?view=logbook` 返回已完成任务

### Step 2: 后端测试

- [ ] `tasks.service.logbook.spec.ts`（或加到现有 tasks.service.spec.ts）：
  - 测 `findAll({ view: 'logbook' })` 返回 status=COMPLETED 的任务
  - 测不含 ACTIVE / TRASHED 任务
  - 测 orderBy 为 completedAt desc（≥2 用例）

**验证**：`pnpm --filter @taskora/backend test` 通过

### Step 3: 前端日期工具

- [ ] `packages/frontend/src/lib/utils/date.ts` 增加 `dayDiff(dateA, dateB)` 函数（返回天数差，基于日期 key 而非毫秒差，避免时区问题）

**验证**：typecheck 通过

### Step 4: Logbook 页面

- [ ] 创建 `packages/frontend/src/pages/Logbook.tsx`：
  - `useTasksQuery({ view: 'logbook' })`
  - 按今天 / 昨天 / 更早分组（useMemo，参考 Upcoming 的 grouped 模式）
  - 每组渲染 TaskItem 列表
  - 点击 task 打开 TaskDetail（复用 Upcoming 的 selected/open state 模式）
- [ ] `router.tsx` 加 `/logbook` 路由

**验证**：`pnpm --filter @taskora/frontend typecheck` + `build` 通过

### Step 5: Sidebar 入口

- [ ] `Sidebar.tsx` 的 `mainNav` 加 `{ to: '/logbook', label: 'Logbook', icon: Notebook }`
- [ ] 确认 `Notebook` 图标在 lucide-react 中存在（若不存在用 `CheckCircle` 或 `BookOpen`）

**验证**：侧栏渲染 Logbook 入口，点击进入 `/logbook`

### Step 6: 全流程验证 + spec 更新

- [ ] `pnpm test` 全仓通过
- [ ] `pnpm typecheck` 全仓通过
- [ ] `pnpm --filter @taskora/frontend build` 通过
- [ ] 手动流程：完成一个任务 → 出现在 Logbook → 点击任务 → 取消完成 → 从 Logbook 消失
- [ ] 更新 `.trellis/spec/backend/database-guidelines.md`：记录 view 模式与动态 orderBy 约定

**验证**：全流程走通

## Validation Commands

```bash
pnpm --filter @taskora/shared build
pnpm typecheck
pnpm test
pnpm --filter @taskora/frontend build
```

## Review Gates

- Step 1 后：review orderBy 重构是否影响其他 view（today/upcoming/anytime 等的排序应不变）
- Step 4 后：review Logbook 分组逻辑是否正确处理 completedAt 为 null 的边界（防御性跳过）
- Step 6 后：review spec 更新

## Rollback Points

- Step 1 后：删除 logbook case + 还原 orderBy 即可回滚
- Step 4 前：前端页面独立，删除 Logbook.tsx + 路由即可回滚