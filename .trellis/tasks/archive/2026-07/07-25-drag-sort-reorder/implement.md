# 执行计划：拖拽排序（任务/项目/区域）

## 实现顺序

按"后端契约先于前端消费"分层推进。每步结束跑一次 `typecheck`。

### 步骤 1：共享 DTO

- [ ] 1.1 新建 `packages/shared/src/dtos/reorder.dto.ts`，导出 `ReorderDto { orderedIds: string[] }`
- [ ] 1.2 `packages/shared/src/index.ts` re-export reorder.dto
- [ ] 1.3 `packages/shared/src/dtos/project.dto.ts`：`ProjectResponseDto` 加 `sortOrder: number`
- [ ] 1.4 `packages/shared/src/dtos/area.dto.ts`：`AreaResponseDto` 加 `sortOrder: number`
- [ ] 1.5 `pnpm typecheck` 通过

### 步骤 2：Prisma schema + 迁移

- [ ] 2.1 `schema.prisma`：`Area` 加 `sortOrder Int @default(0)` + `@@index([userId])`；`Project` 同样
- [ ] 2.2 `cd packages/backend && pnpm prisma migrate dev --name add_sort_order_to_project_and_area`
- [ ] 2.3 更新 `prisma/seed.ts`：为 Project / Area 数据加连续 sortOrder（按 createdAt 顺序）
- [ ] 2.4 `pnpm prisma db seed` 重置种子，验证

### 步骤 3：后端 Project / Area 改造

- [ ] 3.1 `projects.service.ts`：
  - `findAll` 改 orderBy `[sortOrder asc, createdAt desc]`
  - `create` 设 `sortOrder = (max _max.sortOrder ?? -1) + 1`
  - 新增 `reorder(userId, orderedIds)`：findMany 校验归属 + `$transaction(updateMany per id)`
- [ ] 3.2 `dto/projects.dto.ts`：新增 `ReorderDto` class-validator
- [ ] 3.3 `projects.controller.ts`：新增 `@Post('reorder')`，**放在 `@Post()` create 之外**，确保不与 `:id` 路由冲突（声明顺序在 `@Get(':id')` 之前；实际 NestJS POST 不同 path 不会冲突，但保持清晰先列 reorder）
- [ ] 3.4 `areas.service.ts` / `areas.controller.ts` / `dto/areas.dto.ts` 同样改造
- [ ] 3.5 后端测试：
  - 补/扩展 `projects.service.spec.ts`：reorder 成功 + 越权 id 抛 NotFound、findAll 排序、create 初始 sortOrder
  - 补 `areas.service.spec.ts` 同上
  - 跑 `pnpm test` 全绿
- [ ] 3.6 `pnpm typecheck` + `pnpm lint` 通过

### 步骤 4：后端 Task reorder（仅 API，schema 已有 sortOrder）

- [ ] 4.1 `tasks.service.ts`：新增 `reorder(userId, orderedIds)` 方法（模式同 Project）
- [ ] 4.2 `tasks.controller.ts`：新增 `@Post('reorder')`
- [ ] 4.3 `dto/tasks.dto.ts`：新增 `ReorderDto`
- [ ] 4.4 扩展 `tasks.service.search.spec.ts` 或新建 `tasks.service.reorder.spec.ts`：reorder 成功 + 越权
- [ ] 4.5 `pnpm test` + `pnpm typecheck` 通过

### 步骤 5：前端依赖 + API + hooks

- [ ] 5.1 `packages/frontend` 安装 `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`（pnpm add）
- [ ] 5.2 `tasks.api.ts` 新增 `reorderTasks(orderedIds)`；`projects.api.ts` 新增 `reorderProjects`；`areas.api.ts` 新增 `reorderAreas`
- [ ] 5.3 `useTasks.ts` 新增 `useReorderTasks`（onMutate setQueriesData 重排 + onError/onSettled invalidate）
- [ ] 5.4 `useProjects.ts` 新增 `useReorderProjects`（同构）
- [ ] 5.5 `useAreas.ts` 新增 `useReorderAreas`（同构）
- [ ] 5.6 `pnpm typecheck` 通过

### 步骤 6：前端 TaskList 可拖拽改造

- [ ] 6.1 `TaskList.tsx`：
  - 新增 props `onReorder?: (orderedIds: string[]) => void` 与 `sortable?: boolean = true`
  - 引入 `DndContext` / `SortableContext` / `PointerSensor` / `verticalListSortingStrategy` / `arrayMove`
  - `PointerSensor` 设 `activationConstraint: { distance: 5 }` 区分点击/拖拽
  - `handleDragEnd` → `arrayMove(ids)` → `onReorder?.(reordered)`
- [ ] 6.2 在 `TaskList.tsx` 同文件新增 `SortableTaskItem` 包装组件（`useSortable` + `CSS.Translate.toString`），内部渲染 `TaskItem`
- [ ] 6.3 `TaskListView.tsx`：接入 `useReorderTasks`，传 `onReorder={(ids) => reorderTasks.mutate(ids)}`
- [ ] 6.4 `pnpm typecheck` + 手动验证 Inbox 拖拽

### 步骤 7：前端 Projects / Areas / AreaDetail 改造

- [ ] 7.1 `Projects.tsx`：DndContext + SortableContext + 新增 `SortableProjectItem` 包装；接入 `useReorderProjects`
- [ ] 7.2 `Areas.tsx`：同构 + `useReorderAreas`
- [ ] 7.3 `AreaDetail.tsx` 项目子列表分支：同 Projects DnD 改造
- [ ] 7.4 `pnpm typecheck` + `pnpm lint` 通过

### 步骤 8：Upcoming / SearchModal / Trash / Logbook 隔离确认

- [ ] 8.1 确认 `Upcoming.tsx` 未引入 DnD（保持原 `.map` 渲染）
- [ ] 8.2 `SearchModal.tsx` 中 TaskListView 调用传 `sortable={false}`（避免搜索结果被拖拽）
- [ ] 8.3 确认 Trash / Logbook 页面若用 TaskListView，传 `sortable={false}`（这些视图不应重排）
- [ ] 8.4 验证：上述页面不出现拖拽行为

### 步骤 9：全量验证

- [ ] 9.1 `pnpm typecheck` 全绿
- [ ] 9.2 `pnpm lint` 全绿
- [ ] 9.3 `pnpm test` 全绿（后端 + 前端）
- [ ] 9.4 手动 e2e（dev 环境）：
  - Inbox 拖拽 task → 顺序变化、刷新保持
  - Projects 拖拽 project → 顺序变化、刷新保持
  - Areas 拖拽 area → 顺序变化、刷新保持
  - AreaDetail 项目子列表拖拽 → 顺序变化
  - Upcoming 列表无拖拽
  - 模拟 reorder API 失败（断网）→ 列表顺序回滚
  - 新建 Project / Area → 出现在末尾
- [ ] 9.5 截图/录屏存证

## 复核门 / Rollback 点

| 检查点 | 失败处理 |
|---|---|
| 步骤 2 迁移失败 | 回滚 schema.prisma，删除迁移目录，重试 |
| 步骤 3-4 后端测试不过 | 不进入前端改造，先修后端 |
| 步骤 6 前端拖拽不工作或点击被误触发 | 调 `activationConstraint.distance`（5px→8px） |
| 步骤 9 e2e 失败 | 定位是后端 reorder 还是前端乐观更新问题，回到对应步骤 |

## 交付物

- Prisma 迁移文件
- 后端 3 个 service.reorder + controller + DTO
- 后端测试更新
- shared DTO 更新
- 前端 DnD 依赖 + 3 个 reorder hook + 3 个 list 改造
- spec 更新（backend `database-guidelines` reorder 章节、frontend `component-guidelines` DnD 章节、`state-management` 乐观更新章节）