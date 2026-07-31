# Implement: Convert task to project

## 检查清单

### 后端
- [ ] 1. `TasksService.convertToProject(userId, id)` 实现（事务 + BFS 后代 + 解析 effectiveAreaId（任务优先，否则原 project.areaId）+ 创建项目 + 迁移后代 + 清空直接子 parentId + 硬删除原任务）
- [ ] 2. `TasksController` 新增 `POST /tasks/:id/convert-to-project` 路由，返回新 project
- [ ] 3. `TasksModule` 若需引用返回类型，确认无需额外 import（Project 类型来自 prisma）

### 前端
- [ ] 4. `lib/api/tasks.api.ts` 新增 `convertTaskToProject(id)`
- [ ] 5. `lib/hooks/useTasks.ts` 新增 `useConvertTaskToProject` mutation（失效 tasks/projects/detail）
- [ ] 6. `TaskContextMenu.tsx` 在 Tags 与 Delete 之间插入"转换为项目"项，仅 default variant 渲染
- [ ] 7. i18n: `src/i18n/locales/zh/task.json` + `src/i18n/locales/en/task.json` 新增 convertToProject / convertSuccess / convertFailed

### 验证
- [ ] 8. `pnpm -w lint`
- [ ] 9. `pnpm -w typecheck`
- [ ] 10. （手动）转换含子任务+标签的任务，验证项目与子任务迁移正确

## 验证命令

```bash
pnpm -w lint
pnpm -w typecheck
```

## 回滚点

- 后端 service/controller 改动可单独 revert（新方法 + 路由，不影响现有功能）。
- 前端菜单项为新增按钮，revert 不影响现有菜单。

## Review Gates

- 后端事务逻辑 review（后代迁移 + NoAction 约束规避）
- 前端菜单仅在 default variant 渲染
- i18n zh/en 均已补齐
