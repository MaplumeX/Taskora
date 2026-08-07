# Implement: Optimistic Updates

## 执行顺序

按依赖与风险从低到高推进。每个 hook 文件改完即跑测试验证。

### Phase A — Task hooks（最高频，核心）

1. **`useTasks.ts` — complete / uncomplete**
   - `useCompleteTask`：onMutate 切换 `status='COMPLETED'` + `completedAt=now`（列表 + 详情），snapshot 回滚，onError toast，onSettled invalidate `['tasks']` + `['feed']`。
   - `useUncompleteTask`：对称切换回 `status` / `completedAt=null`。
   - 验证：`pnpm --filter @taskora/frontend test -- useTasks`（若有测试）；手动点勾选确认即时响应。

2. **`useTasks.ts` — update**
   - `useUpdateTask`：onMutate 合并 `data` 到列表项 + 详情，snapshot 回滚，onSettled invalidate `['tasks']` + `['task',id]` + `['feed']`。
   - 验证：编辑标题、日期，确认即时生效。

3. **`useTasks.ts` — create / delete / restore**
   - `useCreateTask`：onMutate append 临时项，onSuccess 替换为真值，onError 回滚，onSettled invalidate。
   - `useDeleteTask`：onMutate 移除，onError 恢复，onSettled invalidate。
   - `useRestoreTask`：onMutate 改 `trashedAt=null`，回滚，invalidate。
   - 验证：新建/删除/恢复即时响应。

4. **`useTasks.ts` — subtask 系列**
   - `useCreateSubtask` / `useUpdateSubtask` / `useCompleteSubtask` / `useUncompleteSubtask` / `useDeleteSubtask`：onMutate 改 `['task', taskId]` 详情的 `subtasks` 数组，snapshot 回滚，onSettled invalidate `['task',taskId]` + `['tasks']` + `['feed']`。
   - 验证：展开 task，操作 subtask 即时响应。

5. **`useReorderTasks` — 可选补充 snapshot 回滚**（低优先级，若现有逻辑稳定不改）。

### Phase B — Project hooks

6. **`useProjects.ts` — complete / uncomplete / update / delete / restore**
   - 同 Task 模式，列表 `['projects']` + 详情 `['project',id]` + feed。
   - `useCreateProject`：把 onSuccess setQueryData 迁移到 onMutate（临时项）+ onSuccess 替换真值。
   - 验证：`pnpm --filter @taskora/frontend test`；手动操作。

7. **`useReorderProjects` — 可选补充 snapshot**。

### Phase C — Area hooks

8. **`useAreas.ts` — update / delete**
   - `useCreateArea`：把 onSuccess setQueryData 迁移到 onMutate + onSuccess 替换。
   - 验证：`pnpm --filter @taskora/frontend test useAreas`（现有测试保持通过）。

9. **`useReorderAreas` — 保持**。

### Phase D — Tag hooks

10. **`useTags.ts` — create / update / delete**
    - 列表 `['tags']` + 详情 `['tag',id]`；delete 额外 invalidate `['tasks']`（徽章）。
    - 验证：手动操作标签。

### Phase E — 测试补充

11. 为改造的 hook 新增乐观更新测试：
    - `useTasks.test.ts`（新建）：complete / uncomplete / update / create / delete 乐观值 + 回滚。
    - `useProjects.test.ts`（新建）：complete / update / delete 乐观值 + 回滚。
    - `useTags.test.ts`（新建）：create / update / delete 乐观值 + 回滚。
    - 更新 `useAreas.test.ts`：补充乐观更新断言。
    - 测试模板参考 `useAreas.test.ts` / `useProjectHeadings.test.ts`。

### Phase F — 全量验证

12. `pnpm --filter @taskora/frontend lint`
13. `pnpm --filter @taskora/frontend test`
14. `pnpm --filter @taskora/frontend build`（确认类型与构建通过）

## 验证命令

```bash
# 单 hook 测试
pnpm --filter @taskora/frontend test -- useTasks
pnpm --filter @taskora/frontend test -- useAreas
# 全量前端
pnpm --filter @taskora/frontend lint
pnpm --filter @taskora/frontend test
pnpm --filter @taskora/frontend build
```

## 回滚点

- 每个 Phase（A/B/C/D）独立，改完即可提交。若某 Phase 引入回归，单独 revert 对应 hook 文件。
- 测试失败时优先修复，不跳过。

## Review Gates

- Phase A 完成后：手动验证勾选/编辑/新建/删除 task 即时响应。
- Phase B-D 完成后：对应实体手动验证。
- Phase F：全量 lint + test + build 通过后方可提交。

## 风险文件

- `packages/frontend/src/lib/hooks/useTasks.ts` — 最大改造面，最易出错（列表多变体 + subtask 嵌套）。
- `packages/frontend/src/lib/hooks/useProjects.ts` — create 逻辑迁移。
- `packages/frontend/src/lib/hooks/useAreas.ts` — create 逻辑迁移 + 现有测试。