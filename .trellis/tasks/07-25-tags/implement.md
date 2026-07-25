# Tags — 执行计划

依赖 `test-infra` 完成后再开始。每个 Step 需通过验证后进入下一步。

### Step 1: Prisma schema + migration

- [ ] 在 `schema.prisma` 新增 `TagGroup` / `Tag` / `TaskTag` model（见 design §1）
- [ ] Task model 增加 `tags TaskTag[]` relation
- [ ] User model 增加 `tags Tag[]` + `tagGroups TagGroup[]` relation
- [ ] 运行 `pnpm --filter @taskora/backend prisma:migrate -- --name add_tags`
- [ ] 运行 `prisma generate` 更新 client

**验证**：`npx prisma migrate status` 无 pending，`@prisma/client` 已含新 model 类型

### Step 2: shared 包 DTO

- [ ] 创建 `packages/shared/src/dtos/tag.dto.ts`（见 design §2.2）
- [ ] 创建 `packages/shared/src/dtos/tag-group.dto.ts`
- [ ] 更新 `packages/shared/src/dtos/task.dto.ts`：UpdateTaskDto 加 `tagIds?: string[]`；TaskResponseDto 加 `tags?: TagResponseDto[]`
- [ ] 更新 `packages/shared/src/index.ts` 导出新 DTO
- [ ] `pnpm --filter @taskora/shared build`

**验证**：`pnpm --filter @taskora/backend typecheck` + `pnpm --filter @taskora/frontend typecheck` 通过

### Step 3: 后端 TagGroups Module

- [ ] 创建 `packages/backend/src/tag-groups/`：module / controller / service / dto
- [ ] DTO 用 class-validator：CreateTagGroupDto (title @IsString)、UpdateTagGroupDto (title? @IsOptional @IsString)
- [ ] Service：create / findAll（含 tags） / findOne / update / remove
- [ ] Controller：`@UseGuards(JwtAuthGuard)` + `@Controller('tag-groups')`
- [ ] 注册到 `app.module.ts`

**验证**：`pnpm --filter @taskora/backend typecheck` 通过；手动 curl `POST /tag-groups` 返回 201

### Step 4: 后端 Tags Module

- [ ] 创建 `packages/backend/src/tags/`：module / controller / service / dto
- [ ] TagsDto class-validator：color 用 `@Matches(/^#[0-9A-Fa-f]{6}$/)` 校验
- [ ] Service：create / findAll / findOne / update / remove（见 design §3.1）
- [ ] Controller：`@Controller('tags')`，CRUD 端点
- [ ] 注册到 `app.module.ts`

**验证**：`pnpm --filter @taskora/backend typecheck` 通过；手动 curl 端点正常

### Step 5: TasksService 扩展 tagIds

- [ ] `TasksService.update`：在现有逻辑后加 `if (dto.tagIds !== undefined)` 分支，用 `$transaction` 包 deleteMany + createMany（见 design §3.2）
- [ ] `TasksService.findAll` / `findOne`：include 加 `tags: { include: { tag: true } }`，service 层 map 为 `Tag[]`
- [ ] `TasksController.findAll`：`TaskQueryDto` 加 `tagId` 参数，where 加 `tags: { some: { tagId } }`
- [ ] 后端 `tasks.dto.ts`（class-validator 版）的 UpdateTaskDto 加 `tagIds?: string[]`（`@IsOptional` + `@IsString({ each: true })`）
- [ ] 后端 `TaskQueryDto` 加 `tagId?: string`

**验证**：`pnpm --filter @taskora/backend typecheck` 通过；curl `PATCH /tasks/:id` 传 tagIds 贴标签成功；curl `GET /tasks?tagId=xxx` 筛选生效

### Step 6: 后端测试

- [ ] `tags.service.spec.ts`：mock PrismaService，覆盖 create / findAll / findOne / update / remove（≥5 用例）
- [ ] `tasks.service.tags.spec.ts`：测 update 的 tagIds 全量 set 语义（≥3 用例：加标签、清空、替换）

**验证**：`pnpm --filter @taskora/backend test` 通过

### Step 7: 前端 API + Hooks

- [ ] 创建 `packages/frontend/src/lib/api/tags.api.ts`（见 design §4.1）
- [ ] 创建 `packages/frontend/src/lib/api/tag-groups.api.ts`
- [ ] 创建 `packages/frontend/src/lib/hooks/useTags.ts`（queryKeys + CRUD hooks）
- [ ] 创建 `packages/frontend/src/lib/hooks/useTagGroups.ts`

**验证**：`pnpm --filter @taskora/frontend typecheck` 通过

### Step 8: 前端标签管理页 + 侧栏入口

- [ ] 创建 `packages/frontend/src/pages/Tags.tsx`（标签 + 分组管理）
- [ ] 创建 `packages/frontend/src/pages/TagDetail.tsx`（`/tags/:tagId` 筛选视图）
- [ ] `router.tsx` 加 `/tags` 与 `/tags/:tagId` 路由
- [ ] `Sidebar.tsx` 在 Areas 区后新增 Tags 折叠区（显示标签列表，点击跳 `/tags/:tagId`，底部"管理"链接）

**验证**：`pnpm --filter @taskora/frontend typecheck` + `pnpm --filter @taskora/frontend build` 通过；手动验证页面渲染

### Step 9: TaskDetail 贴标签 + TaskItem 徽章

- [ ] `TaskDetail.tsx` 新增"标签"行：多选下拉从 useTagsQuery 拉标签，选中即 `patch({ tagIds })`
- [ ] `TaskItem.tsx` 新增标签徽章行（`<span>` 小色块）
- [ ] `TaskListView` 若已展示 tags，确保数据透传

**验证**：手动流程：创建标签 → 在 TaskDetail 贴标签 → TaskItem 显示徽章 → 侧栏点击标签筛选

### Step 10: 全流程验证 + spec 更新

- [ ] `pnpm test` 全仓通过
- [ ] `pnpm typecheck` 全仓通过
- [ ] 更新 `.trellis/spec/backend/database-guidelines.md`：记录 Tag/TaskTag 关联策略、set 语义
- [ ] 更新 `.trellis/spec/frontend/component-guidelines.md`：标签徽章、多选下拉模式

**验证**：全流程 e2e 手动走通；spec 已更新

## Validation Commands

```bash
pnpm --filter @taskora/shared build
pnpm --filter @taskora/backend prisma:migrate -- --name add_tags
pnpm typecheck
pnpm test
pnpm --filter @taskora/frontend build
```

## Review Gates

- Step 1 后：review migration SQL 是否纯新增、无破坏性 DROP
- Step 5 后：review tagIds set 语义是否用 `$transaction` 包裹
- Step 9 后：review 前端贴标签后 TaskItem 徽章是否即时更新（TanStack Query invalidation）

## Rollback Points

- Step 1 后：migration 可 `prisma migrate resolve --rolled-back`，schema 还原
- Step 5 前：Tags Module 独立，可注释 app.module 注册来回滚
- Step 8 前：前端路由/页面独立，不影响现有视图