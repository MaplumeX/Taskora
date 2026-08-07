# Design: Optimistic Updates for High-Frequency Operations

## 架构边界

仅改前端 hooks 层（`packages/frontend/src/lib/hooks/*.ts`）与对应测试文件。不改 API 层（`*.api.ts`）、组件层、后端。

## 核心模式：乐观更新三段式

所有被改造的 mutation 从"onSuccess invalidate"统一改为：

```ts
useMutation({
  mutationFn: ...,
  onMutate: async (vars) => {
    // 1. 取消正在进行的列表查询，避免异步刷新覆盖乐观值
    await queryClient.cancelQueries({ queryKey: <listKey> });
    // 2. 快照当前缓存（用于 onError 回滚）
    const snapshot = queryClient.getQueriesData<{...}>({ queryKey: <listKey> });
    // 3. 写入预期值（立即反映到 UI）
    queryClient.setQueriesData<{...}>({ queryKey: <listKey> }, (old) => applyChange(old, vars));
    return { snapshot };
  },
  onError: (err, vars, ctx) => {
    // 4. 失败：回滚到快照
    if (ctx?.snapshot) {
      queryClient.setQueriesData({ queryKey: <listKey> }, (old, idx) => ctx.snapshot[idx] ?? old);
    }
    // 5. toast 错误提示（保留现有行为）
  },
  onSettled: () => {
    // 6. 无论成败：同步服务器真值
    void queryClient.invalidateQueries({ queryKey: <listKey> });
    void queryClient.invalidateQueries({ queryKey: ['feed'] }); // 涉及 feed 的操作
  },
});
```

已有 `useReorderTasks` 是该模式的简化版（无 snapshot 精确回滚，onError 直接 invalidate）。本次改造统一引入 snapshot 回滚，并把 reorder 系列也对齐（可选，低优先级）。

## 各 hook 改造策略

### useTasks.ts

| Hook | onMutate 预期值 | 回滚 | onSettled |
|---|---|---|---|
| `useCompleteTask` | 列表：该 task `status='COMPLETED'`, `completedAt=now`；详情同 | snapshot 回滚 | invalidate `['tasks']` + `['feed']` |
| `useUncompleteTask` | 列表：该 task `status='OPEN'`(或原 status), `completedAt=null`；详情同 | snapshot 回滚 | 同上 |
| `useUpdateTask` | 列表 + 详情：合并 `data` 字段到 task | snapshot 回滚 | invalidate `['tasks']` + `['task',id]` + `['feed']` |
| `useCreateTask` | 列表：append 临时 task（用 `crypto.randomUUID()` 临时 id，`createdAt/updatedAt=now`，字段来自 `CreateTaskDto` + 默认值） | snapshot 回滚 | invalidate `['tasks']` + `['feed']`（真值替换由 invalidate 触发的拉取完成） |
| `useDeleteTask` | 列表：移除该 id | snapshot 回滚 | invalidate `['tasks']` + `['feed']` |
| `useRestoreTask` | 列表：该 task `trashedAt=null`（若列表是 trash view 可能需要移除） | snapshot 回滚 | invalidate `['tasks']` + `['feed']` |
| `useReorderTasks` | 已有 onMutate，补充 snapshot 回滚（可选） | snapshot 回滚 | 保持现有 |
| Subtask 系列 (`useCreateSubtask` / `useUpdateSubtask` / `useCompleteSubtask` / `useUncompleteSubtask` / `useDeleteSubtask`) | 详情：在 `task.subtasks` 数组上增/改/删对应 subtask | snapshot 回滚详情 | invalidate `['task',taskId]` + `['tasks']` + `['feed']` |

#### Subtask 乐观更新的特殊点

Subtask 数据嵌套在 `TaskResponseDto.subtasks` 数组里，乐观更新需同时写 `['task', taskId]`（详情）和所有 `['tasks']` 列表条目中包含该 task 的项。为简化，subtask 操作只乐观更新详情 key `['task', taskId]`，列表通过 `onSettled` invalidate 同步。理由：subtask 展开态主要读详情，列表项通常不展开 subtasks。

### useProjects.ts

| Hook | onMutate | 回滚 | onSettled |
|---|---|---|---|
| `useCompleteProject` / `useUncompleteProject` | 列表 + 详情：`status` / `completedAt` 切换 | snapshot | invalidate `['projects']` + `['project',id]` + `['feed']` |
| `useUpdateProject` | 列表 + 详情：合并字段 | snapshot | 同上 |
| `useCreateProject` | 已部分乐观（onSuccess setQueryData），改为 onMutate append 临时项 | snapshot | invalidate |
| `useDeleteProject` | 列表：移除 | snapshot | invalidate |
| `useRestoreProject` | 列表 + 详情：`trashedAt=null` | snapshot | invalidate |
| `useReorderProjects` | 已有，补充 snapshot（可选） | snapshot | 保持 |

### useAreas.ts

| Hook | onMutate | 回滚 | onSettled |
|---|---|---|---|
| `useCreateArea` | 已部分乐观，改为 onMutate append 临时项 | snapshot | invalidate `['areas']` |
| `useUpdateArea` | 列表 + 详情：合并字段 | snapshot | invalidate `['areas']` + `['area',id]` |
| `useDeleteArea` | 列表：移除 | snapshot | invalidate `['areas']` |
| `useReorderAreas` | 已有，保持 | — | 保持 |

### useTags.ts

| Hook | onMutate | 回滚 | onSettled |
|---|---|---|---|
| `useCreateTag` | 列表：append 临时 tag | snapshot | invalidate `['tags']` |
| `useUpdateTag` | 列表 + 详情：合并字段 | snapshot | invalidate `['tags']` + `['tag',id]` |
| `useDeleteTag` | 列表：移除 | snapshot | invalidate `['tags']` + `['tasks']`（任务徽章） |

### useFeed.ts

`useEmptyTrash`：保持 `onSuccess invalidate` 模式。理由：清空回收站是低频批量操作，乐观更新需大批量移除条目、回滚复杂，收益低风险高。

## 临时 id 与真值替换策略（create 类）

乐观创建时用临时 id（`crypto.randomUUID()`）写入缓存，`onSuccess` 拿到服务器真值后替换：
- `onSuccess` 里：从列表缓存移除临时 id 项，append 服务器返回项；同时 setQueryData 详情 key。
- `onError`：snapshot 回滚（移除临时项）。
- `onSettled`：invalidate 确保最终一致。

> 注：组件层若用临时 id 跳转详情可能出错。当前 create task 后通常留在列表页，风险低。create project/area 的 onSuccess 已有 setQueryData 逻辑（部分乐观），本次对齐到 onMutate。

## 兼容性

- 不改 API 层、不改 DTO、不改后端。
- 组件层调用方式不变（`mutateAsync` / `mutate` 签名不变），无破坏性变更。
- TanStack Query v5 的 `onMutate` 返回值作为 context 传给 `onError`/`onSettled`，与现有用法兼容。

## 风险与权衡

| 风险 | 缓解 |
|---|---|
| 列表多个过滤变体下乐观更新遗漏某个缓存 | 统一用 `setQueriesData({ queryKey: ['tasks'] })` 前缀匹配，覆盖所有变体 |
| 乐观值与服务器真值字段不一致（如 `updatedAt`、`sortOrder`） | `onSettled` invalidate 同步真值；create 用 onSuccess 替换临时项 |
| 并发操作覆盖乐观值 | `cancelQueries` + snapshot 回滚；TanStack Query 内部序列化 mutation |
| 临时 id 在组件中泄漏到后续操作 | create 后若立即编辑该临时项，onSuccess 替换前可能用临时 id 发请求——但现有 UI 流程不支持此路径，低风险 |
| reorder 已有乐观逻辑改动可能引入回归 | reorder 系列仅可选补充 snapshot，不改核心逻辑；测试覆盖 |

## 测试策略

- 每个 hook 的乐观更新行为新增测试：
  - onMutate 后缓存立即反映预期值。
  - onError 后缓存回滚到原值。
  - onSettled 后 invalidate 被调用。
- 复用 `useAreas.test.ts` 的 `createWrapper` 模式（`retry: false`）。
- API 层 mock（`vi.mock`）返回成功/失败两种路径。
- 现有测试保持通过（回归门）。