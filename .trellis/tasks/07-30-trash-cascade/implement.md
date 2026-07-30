# 执行计划：软删除级联 + status enum 拆分

## 执行顺序

### Step 1 — schema 与 shared enum 拆分
- [ ] `packages/shared/src/enums/task.enum.ts`：TaskStatus 去掉 `TRASHED`
- [ ] `packages/shared/src/enums/project.enum.ts`：ProjectStatus 去掉 `TRASHED`
- [ ] `schema.prisma`：TaskStatus / ProjectStatus enum 去掉 `TRASHED`
- [ ] 生成 migration：`pnpm prisma migrate dev --name remove-trashed-from-status`
  - 先 UPDATE 现存 TRASHED 行（补 trashedAt + status=ACTIVE），再 DROP VALUE
- [ ] `pnpm prisma generate`

### Step 2 — 查询条件改造（views + findAll）
- [ ] `tasks/views.ts:49`：trash case → `where.trashedAt = { not: null }`；其他 case 加 `where.trashedAt = null`
- [ ] `projects/views.ts:49`：同上
- [ ] `projects.service.ts:68`：findAll 的 `status: { not: TRASHED }` → `trashedAt: null`
- [ ] `tasks.service.ts:93`：搜索注释更新（不再需 exclude TRASHED）

### Step 3 — service 层 trash/restore 改造
- [ ] `tasks.service.ts` remove：只写 `trashedAt: new Date()`
- [ ] `tasks.service.ts` restore：只写 `trashedAt: null`
- [ ] `projects.service.ts` remove/restore：同上

### Step 4 — 级联 trash/restore
- [ ] `tasks.service.ts` remove：加交互式事务 + 后代 BFS 收集 + `updateMany trashedAt`
- [ ] `tasks.service.ts` restore：加后代收集 + `updateMany trashedAt: null`
- [ ] `projects.service.ts` remove：加 `updateMany({ where: { projectId, userId }, data: { trashedAt: now } })`
- [ ] `projects.service.ts` restore：加对称清空

### Step 5 — emptyTrash 改造
- [ ] `feed.service.ts:42`：`status === TaskStatus.TRASHED` → `trashedAt !== null`

### Step 6 — 前端
- [ ] `ProjectFeedRow.tsx:20`：`item.status === 'TRASHED'` → `item.trashedAt !== null`

### Step 7 — 测试更新
- [ ] `feed.service.spec.ts`：mock 数据 `status: TRASHED` → `trashedAt: new Date()`
- [ ] `tasks.service.*.spec.ts`：mock 数据更新
- [ ] `projects.service.spec.ts`：mock 数据更新
- [ ] 新增：trash 父任务级联子任务的测试用例
- [ ] 新增：restore 级联、COMPLETED 子任务 status 不变的测试用例

## 验证命令

```bash
cd packages/backend && pnpm prisma migrate dev --name remove-trashed-from-status
cd packages/backend && pnpm test
cd packages/frontend && pnpm test
cd packages/backend && pnpm prisma generate
```

## 回滚点

- Step 1 后若 migration 失败：`prisma migrate reset`（开发库）
- Step 4（级联）可作为独立提交，与 Step 1-3、5-6 分离
