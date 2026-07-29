# Design — Empty trash feature

## 范围与端点归属

废纸篓是聚合视图(`FeedService.findAll(userId, 'trash')` 同时拉 trashed task + trashed project),「倾倒」操作天然属于 feed 层。新增 **方案 B(统一端点)**:

- `POST /feed/trash/empty` — 在 `FeedController` 上新增,`FeedService.emptyTrash(userId)` 执行。
- 返回 `{ deletedTasks: number, deletedProjects: number }`,前端用于 toast 文案(可选)。

> 不在 `TasksController` / `ProjectsController` 各开端点:那样前端要并行两次调用,且无法用一个事务保证二者原子。feed 层是唯一拥有「task + project 混合」语义的服务,放这里最内聚。

与现有 action-verb 路由风格一致(`POST /tasks/:id/restore`、`POST /tasks/reorder`),用 `POST /feed/trash/empty` 而非 `DELETE /feed/trash`(DELETE 不带 body、且本项目所有 action 都用 POST)。

## 级联删除算法(核心)

两条已确认决策:
- **B(父子任务)**:trashed task 的所有后代(无论状态)一并永久删除。
- **B'(project→tasks)**:trashed project 下属的所有任务(无论状态)一并永久删除。

`Task.parentId` 与 `Task.projectId` FK 均为 `NO ACTION`,直接 `deleteMany` 会抛 FK 错。必须先在内存算出完整删除集合,再单次 `deleteMany`。

### 在 FeedService.emptyTrash 中的实现

```ts
async emptyTrash(userId: string): Promise<{ deletedTasks: number; deletedProjects: number }> {
  return this.prisma.$transaction(async (tx) => {
    // 1. 取本用户所有 trashed project 的 id
    const trashedProjects = await tx.project.findMany({
      where: { userId, status: ProjectStatus.TRASHED },
      select: { id: true },
    });
    const trashedProjectIds = new Set(trashedProjects.map((p) => p.id));

    // 2. 取本用户所有 task 的 id / parentId / projectId / status(用于在内存算级联集合)
    //    单用户 task 量级 << 1000,全量读 + 内存算比递归 SQL 更可控、类型安全。
    const allTasks = await tx.task.findMany({
      where: { userId },
      select: { id: true, parentId: true, projectId: true, status: true },
    });

    // 3. 删除集 = trashed tasks ∪ trashed tasks 的所有后代 ∪ trashed project 的下属 tasks
    const trashedTaskIds = new Set(
      allTasks.filter((t) => t.status === TaskStatus.TRASHED).map((t) => t.id),
    );

    // 3a. 递归收集 trashed task 的后代(B):从 trashed tasks 出发,沿 parentId 向下找所有层级
    const childrenOf = new Map<string, string[]>();
    for (const t of allTasks) {
      if (t.parentId) {
        const arr = childrenOf.get(t.parentId) ?? [];
        arr.push(t.id);
        childrenOf.set(t.parentId, arr);
      }
    }
    const descendantIds = new Set<string>();
    const queue = [...trashedTaskIds];
    while (queue.length) {
      const layer = queue.splice(0);
      for (const parentId of layer) {
        const kids = childrenOf.get(parentId);
        if (!kids) continue;
        for (const kid of kids) {
          if (!descendantIds.has(kid) && !trashedTaskIds.has(kid)) {
            descendantIds.add(kid);
            queue.push(kid);
          }
        }
      }
    }

    // 3b. trashed project 下属任务(B'):任何 projectId ∈ trashedProjectIds 的 task
    const projectOrphanIds = new Set(
      allTasks
        .filter((t) => t.projectId && trashedProjectIds.has(t.projectId))
        .map((t) => t.id),
    );

    const taskDeleteIds = new Set<string>([
      ...trashedTaskIds,
      ...descendantIds,
      ...projectOrphanIds,
    ]);

    // 4. 物理删除:TaskTag/ProjectTag 关联走 onDelete: Cascade 自动清理,无需手工删
    //    where 再带一次 userId 作防御性约束(集合已来自本用户数据,纯双保险)
    const taskDelete = await tx.task.deleteMany({
      where: { id: { in: [...taskDeleteIds] }, userId },
    });
    const projectDelete = await tx.project.deleteMany({
      where: { id: { in: [...trashedProjectIds] }, userId },
    });

    return { deletedTasks: taskDelete.count, deletedProjects: projectDelete.count };
  });
}
```

### 为什么用交互式 `$transaction(async (tx) => ...)`

- 需要先读、算集合、再删,三步必须同事务保证快照一致(否则读后到删之间别的请求新插入的 trashed task 会被漏删,或新增的子任务引用会产生 FK 问题)。交互式事务提供单一 tx 句柄,读写在同一快照。
- 已有 `ProjectsService` 的 `tagIds` update 用数组式 `$transaction([...])`,但那是「多个已知写操作并行」;emptyTrash 是「读-算-写」序列,只能用交互式。
- 测试 mock:`projects.service.spec.ts` 现有 `$transaction: vi.fn((promises) => Promise.all(promises))` 只支持数组式。**feed.service.spec.ts 是新文件**,会补上交互式 mock:`$transaction: vi.fn(async (cb) => cb(mockTx))`。这是本项目第一次用交互式事务,需在 backend spec 的 database-guidelines 补一条说明。

### 物理删除 vs 软删除规范

`database-guidelines.md` 写「Task 使用软删除,不使用 Prisma DELETE」。本特性是这条规范的**唯一受控例外**:倾倒废纸篓 = 永久删除已软删除的项。需在 spec 中补一条「物理删除例外」说明,明确:
- 只允许在 `FeedService.emptyTrash` 内做物理删除。
- 物理删除的 where 必须同时含 `userId` + `status=TRASHED`(或基于已确认 TRASHED 集合的 id IN)。
- 任何其他路径仍保持软删除。

## 前端设计

### API 层 (`packages/frontend/src/lib/api/feed.api.ts`)

```ts
export function emptyTrash(): Promise<{ deletedTasks: number; deletedProjects: number }> {
  return apiClient
    .post('/feed/trash/empty')
    .then((res) => res.data);
}
```

### Hook (`packages/frontend/src/lib/hooks/useFeed.ts`)

新增 `useEmptyTrash`,放在 `useFeed.ts`(与 feed 数据语义同源):

```ts
export function useEmptyTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: emptyTrash,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
```

失效 `feedKeys.all`(trash 视图 + 其他视图都可能因永久删除而变化)、`['tasks']`(可能有 task detail list 缓存引用了被删 task)、`['projects']`(project detail 列表)。遵循 hook-guidelines 的 invalidation 约定。

### UI (`packages/frontend/src/pages/Trash.tsx`)

- 在 `<h1>` 同行右侧新增「倾倒废纸篓」按钮(`Trash2` 图标 + 文案),`variant="ghost"` `size="sm"`。
- `items.length === 0` 时 `disabled`(保留可见但不可点,符合「空废纸篓」心智;不隐藏以保持布局稳定)。
- 点击打开确认 `Dialog`(复用现有 `@/components/ui/dialog`,不引入新 radix 包)。
- Dialog 内:
  - `DialogTitle`:「倾倒废纸篓」
  - `DialogDescription`:「将永久删除废纸篓中的所有任务和项目,此操作不可恢复。」
  - `DialogFooter`:「取消」(ghost)+「倾倒」(destructive variant)
- 确认后调 `emptyTrash.mutate(undefined, { onSuccess, onError })`:
  - onSuccess:关闭 dialog,toast.success(t('common:emptyTrashSuccess'))
  - onError:toast.error(t('common:emptyTrashFailed'))
- mutation pending 时禁用两个按钮,「倾倒」显示 loading 文案。

### 确认对话框组件实现策略

内联到 `Trash.tsx` 里,用 `useState` 控制 open 态。不抽独立组件 —— 只此一处使用,且确认文案是废纸篓专属,抽组件反而增加间接层(符合「简洁优先」)。

### i18n (zh + en 同步)

在 `common.json` 新增(zh/en 两份都加,保持 key 集合一致):

```json
{
  "emptyTrash": "倾倒废纸篓" / "Empty Trash",
  "emptyTrashConfirmTitle": "倾倒废纸篓?" / "Empty Trash?",
  "emptyTrashConfirmDescription": "将永久删除废纸篓中的所有任务和项目,此操作不可恢复。" / "This permanently deletes all tasks and projects in Trash. This cannot be undone.",
  "emptyTrashConfirmAction": "倾倒" / "Empty",
  "emptyTrashSuccess": "废纸篓已清空" / "Trash emptied",
  "emptyTrashFailed": "倾倒废纸篓失败" / "Failed to empty trash"
}
```

放在 common 而非 task namespace:这些是通用破坏性操作词,后续「清空日志本」等场景可复用。

### 不引入新依赖

不安装 `@radix-ui/react-alert-dialog`。现有 `Dialog` 已能完成确认交互;a11y 上 `DialogDescription` 提供了足够的语义。增加一个 radix 包只为换一个 `<AlertDialog>` 标签,违反「简洁优先」。

## 测试策略

### 后端 (`packages/backend/test/feed.service.spec.ts` — 新文件)

参考 `projects.service.spec.ts` 的 mock 模式,但 `$transaction` 用交互式 mock:

```ts
mockPrisma = {
  task: { findMany: vi.fn(), deleteMany: vi.fn() },
  project: { findMany: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(async (cb) => cb(mockPrisma)),
} as unknown as InstanceType<typeof PrismaService>;
```

用例:
1. 空 trash:无 trashed task / project → deleteMany 不被调用 / count=0。
2. 仅 trashed task,无子任务 → 删该 task,count=1。
3. trashed task 有 active 子任务(B)→ 父子都删,count=2。
4. trashed task 有多层级联后代 → 全部删,count=N。
5. trashed project 下属 active task(B')→ project + task 都删。
6. 非 trashed task**不**被删(验证 status 隔离)。
7. 其他用户的 task 不被删(验证 where userId 隔离 —— 通过 mock findMany 的 where 参数断言)。

### 前端

- 不新增单测(项目前端没单测基础设施,Trash.tsx 交互简单)。靠手动验收 + 后端单测保障核心逻辑。

## 影响面

- `packages/backend/src/feed/feed.service.ts` — 新增 emptyTrash 方法。
- `packages/backend/src/feed/feed.controller.ts` — 新增 `@Post('trash/empty')` 端点。
- `packages/backend/test/feed.service.spec.ts` — 新建。
- `packages/frontend/src/lib/api/feed.api.ts` — 新增 emptyTrash 函数。
- `packages/frontend/src/lib/hooks/useFeed.ts` — 新增 useEmptyTrash hook。
- `packages/frontend/src/pages/Trash.tsx` — 新增按钮 + Dialog。
- `packages/frontend/src/i18n/locales/{zh,en}/common.json` — 新增 6 个 key。
- `.trellis/spec/backend/database-guidelines.md` — 补「物理删除例外」+ 交互式事务说明。
- `.trellis/spec/frontend/{i18n-guidelines,hook-guidelines}.md` — 不需要改(遵循现有约定)。

## 回滚

单 commit 即可 revert;无 schema 变更、无 migration、无新依赖。物理删除的数据不可恢复,但这是产品语义本身。
