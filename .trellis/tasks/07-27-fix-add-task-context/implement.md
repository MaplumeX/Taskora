# 执行计划

## 步骤 1: shared DTO 新增 tagIds

**文件**: `packages/shared/src/dtos/task.dto.ts`

- `CreateTaskDto` interface 末尾新增 `tagIds?: string[]`

**验证**: `pnpm --filter @taskora/shared build` 通过

## 步骤 2: 后端 DTO 新增验证

**文件**: `packages/backend/src/tasks/dto/tasks.dto.ts`

- `CreateTaskDto` class 末尾新增：
  ```ts
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
  ```

## 步骤 3: 后端 service create() 处理 tagIds

**文件**: `packages/backend/src/tasks/tasks.service.ts`

- `create()` 的 `prisma.task.create` data 块新增 tagIds nested create
- `create()` 加 `include: { tags: { include: { tag: true } } }`
- 返回前 map tags: `tags: created.tags.map(tt => tt.tag)`

**验证**: `pnpm --filter backend build` + `pnpm --filter backend test` 通过

## 步骤 4: 前端 usePageTaskContext 扩展

**文件**: `packages/frontend/src/lib/hooks/usePageTaskContext.ts`

- 导入 `TaskBucket`
- 返回类型改为 `Omit<Partial<CreateTaskDto>, 'title'>`
- `useParams` 泛型改为 `<{ id: string; tagId: string }>`
- 新增 `/anytime` → `{ bucket: TaskBucket.ANYTIME }`
- 新增 `/areas/:id` → `{ areaId: params.id }`  (用 `pathname.startsWith('/areas/') && params.id`)
- 新增 `/tags/:tagId` → `{ tagIds: [params.tagId] }`  (用 `pathname.startsWith('/tags/') && params.tagId`)

**验证**: `pnpm --filter frontend build` 通过

## 步骤 5: 前端 ContentBottomBar 隐藏按钮

**文件**: `packages/frontend/src/components/layout/ContentBottomBar.tsx`

- 导入 `useLocation`
- 定义 `const HIDE_ADD_TASK_ROUTES = ['/upcoming', '/logbook', '/trash']`
- 组件内 `const { pathname } = useLocation()` + `const showAddTask = !HIDE_ADD_TASK_ROUTES.includes(pathname)`
- 添加任务按钮用 `{showAddTask && (...)}` 条件包裹

**验证**: `pnpm --filter frontend build` 通过

## 步骤 6: 全量验证

```bash
pnpm -r build
pnpm --filter backend test
```

## Review Gate

实现完成后，用 `trellis-check` sub-agent 跑一轮检查，确认所有 AC 满足后再进入 Phase 3。

## Rollback

所有改动都是纯增量（新增字段、新增路由分支、条件渲染），不修改现有逻辑。回滚只需 revert 单个 commit。
