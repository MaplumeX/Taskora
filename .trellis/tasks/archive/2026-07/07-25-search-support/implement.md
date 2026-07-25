# Implement — Task search support

## Checklist

### Backend
- [ ] 1. `packages/shared/src/dtos/task.dto.ts`：无 TaskQueryDto 在 shared（已确认 TaskQuery 仅在前端 `tasks.api.ts`）；跳过此步，改在前端 api 层。
- [ ] 2. `packages/backend/src/tasks/dto/tasks.dto.ts`：`TaskQueryDto` 新增 `q?: string`（`@IsOptional() @IsString()`）。
- [ ] 3. `packages/backend/src/tasks/tasks.service.ts`：`findAll` 中追加 `q` 分支——构造 `where.OR`（title/notes contains insensitive），并在 `q` 模式无 `view` 时设置 status（默认 ACTIVE，`completed=true` 时 `[ACTIVE, COMPLETED]`，始终排除 TRASHED）。
- [ ] 4. 后端测试：在 `packages/backend/test/` 新增或补充 spec，覆盖 `q` 匹配 title、匹配 notes、默认排除 COMPLETED/TRASHED、`completed=true` 含 COMPLETED 不含 TRASHED、空 `q` 不报错。

### Frontend
- [ ] 5. `packages/frontend/src/lib/api/tasks.api.ts`：`TaskQuery` 接口新增 `q?: string`。
- [ ] 6. `packages/frontend/src/lib/hooks/useDebouncedValue.ts`：创建通用去抖 hook（若已存在则复用）。
- [ ] 7. `packages/frontend/src/components/search/SearchBar.tsx`：新建组件——输入框 + 快捷键监听 + 去抖 + "包含已完成"开关 + 结果区（`TaskListView` 渲染 + 空态/加载态/错误态）。
- [ ] 8. `packages/frontend/src/components/layout/AppShell.tsx`：在 Sidebar 与 MainContent 之间插入 SearchBar，调整布局结构使 SearchBar 固定顶部。
- [ ] 9. 前端验证：搜索输入去抖后正确调用 `getTasks({ q })`；`Esc` 清空；`Cmd/Ctrl+K` 聚焦；空输入不请求；结果项完成/取消完成正常。

### Quality
- [ ] 10. `pnpm typecheck` 通过。
- [ ] 11. `pnpm lint` 通过。
- [ ] 12. `pnpm test` 通过。

## Validation Commands

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Risky Files / Rollback Points

- `packages/backend/src/tasks/tasks.service.ts` — 核心查询逻辑，改动 `findAll` 的 `where` 构建。回滚：移除 `q` 分支。
- `packages/frontend/src/components/layout/AppShell.tsx` — 布局结构调整。回滚：还原为 `<Sidebar /><MainContent />`。
- 新增文件 `SearchBar.tsx`、`useDebouncedValue.ts` — 纯新增，回滚直接删除。

## Follow-up Checks Before `task.py start`

- [ ] PRD 收敛检查完成、无未决 Open Questions。
- [ ] `implement.jsonl` / `check.jsonl` 已填入真实 spec 条目（sub-agent 模式）。
- [ ] 用户已审批最终规划摘要。