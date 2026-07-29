# Implement — Empty trash feature

## 执行顺序

按「后端 → 前端 → spec → 验收」顺序推进;后端是核心逻辑,前端依赖后端契约,spec 最后沉淀。

### Step 1: 后端 FeedService.emptyTrash

- [ ] 在 `packages/backend/src/feed/feed.service.ts` 新增 `emptyTrash(userId)`:
  - import `TaskStatus`, `ProjectStatus` from `@taskora/shared`(file 已 import 部分 enum,补全)
  - 实现交互式 `$transaction(async (tx) => ...)`,算法见 design.md
  - 内存算级联集合(trashed tasks → 递归后代 → ∪ trashed project 下属 tasks)
  - 单次 `tx.task.deleteMany({ where: { id: { in: [...] }, userId } })`
  - 单次 `tx.project.deleteMany({ where: { id: { in: [...] }, userId } })`
  - 返回 `{ deletedTasks: number, deletedProjects: number }`
- [ ] 在 `packages/backend/src/feed/feed.controller.ts` 新增:
  ```ts
  @Post('trash/empty')
  emptyTrash(@Request() req: { user: { id: string } }) {
    return this.feedService.emptyTrash(req.user.id);
  }
  ```
  import `Post` from `@nestjs/common`(file 目前只 import `Get, Query, UseGuards, Request`)

### Step 2: 后端单测

- [ ] 新建 `packages/backend/test/feed.service.spec.ts`,mock prisma 含交互式 `$transaction`:
  ```ts
  $transaction: vi.fn(async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma))
  ```
- [ ] 用例覆盖(见 design.md «测试策略»):
  1. 空 trash
  2. 仅 trashed task 无子
  3. trashed task + active 子任务(B 级联)
  4. 多层级联
  5. trashed project + 下属 active task(B' 级联)
  6. status 隔离(非 trashed 不删)
  7. userId 隔离(断言 findMany where 含 userId;deleteMany where 含 userId)
- [ ] `pnpm --filter backend test` 通过

### Step 3: 前端 API + Hook

- [ ] `packages/frontend/src/lib/api/feed.api.ts` 新增 `emptyTrash()` (POST /feed/trash/empty)
- [ ] `packages/frontend/src/lib/hooks/useFeed.ts` 新增 `useEmptyTrash`:
  - mutationFn = emptyTrash
  - onSuccess invalidate `feedKeys.all` + `['tasks']` + `['projects']`
- [ ] `pnpm --filter frontend typecheck` 通过

### Step 4: 前端 UI

- [ ] `packages/frontend/src/pages/Trash.tsx`:
  - import `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter` from `@/components/ui/dialog`
  - import `Button` from `@/components/ui/button`
  - import `Trash2` from `lucide-react`
  - 在组件内:`const emptyTrash = useEmptyTrash();` + `const [confirmOpen, setConfirmOpen] = useState(false);`
  - h1 区改为 `<div className="flex items-center justify-between">` 包裹 h1 + Button
  - Button:`disabled={items.length === 0 || emptyTrash.isPending}`,onClick 打开 confirm dialog
  - Dialog:确认后 `emptyTrash.mutate(undefined, { onSuccess: () => { setConfirmOpen(false); toast.success(t('common:emptyTrashSuccess')); }, onError: () => toast.error(t('common:emptyTrashFailed')) })`
  - 确认按钮 `disabled={emptyTrash.isPending}`,pending 时文案改为 loading(或保留文案 + disabled)

### Step 5: i18n文案

- [ ] `packages/frontend/src/i18n/locales/zh/common.json` 新增 6 个 key(见 design.md)
- [ ] `packages/frontend/src/i18n/locales/en/common.json` 新增同样 6 个 key
- [ ] 用 `jq -S 'keys'` 跑 parity 校验(zh/en 一致)

### Step 6: Spec 沉淀(Phase 3.3)

- [ ] `.trellis/spec/backend/database-guidelines.md` 补两条:
  1. 「物理删除例外」小节:仅在 `FeedService.emptyTrash` 中允许物理 deleteMany,where 必须含 `userId` + 集合来自 `status=TRASHED`;其他路径保持软删除。
  2. 「交互式事务」说明:读-算-写序列用 `$transaction(async (tx) => ...)`,与数组式 `$transaction([...])` 的适用场景对比。
- [ ] 不动 frontend spec(本次遵循已有 hook/i18n 约定,无新约定)。

### Step 7: 全量质量检查

- [ ] `pnpm typecheck`(全部 package)
- [ ] `pnpm test`(后端单测绿)
- [ ] `pnpm lint`
- [ ] 手动验收:dev 模式启服务,废纸篓有数据时点「倾倒废纸篓」→ 确认 dialog → 列表清空 + toast;空废纸篓时按钮 disabled;其他用户数据不受影响

## 验证命令汇总

```bash
pnpm --filter backend test
pnpm --filter frontend typecheck
pnpm typecheck
pnpm lint
# i18n parity
for f in common nav task project area tag auth search theme; do
  diff <(jq -S 'keys' packages/frontend/src/i18n/locales/zh/$f.json) \
       <(jq -S 'keys' packages/frontend/src/i18n/locales/en/$f.json) && echo "✓ $f"
done
```

## Review Gates

- Step 2 完成后(后端单测绿)是第一个 checkpoint:确认级联逻辑正确再继续前端。
- Step 7 全量绿为最终 gate,通过后才可进入 Phase 3.4 commit。

## 回滚点

- 任何 step 失败:由于无 schema/迁移/依赖变更,直接 git checkout 对应文件即可回退。
- 后端逻辑错误但已部署:物理删除不可恢复,但这是产品语义本身;修复后重新部署。
