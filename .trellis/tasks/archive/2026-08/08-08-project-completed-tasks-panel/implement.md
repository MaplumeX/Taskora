# Implement: 项目详情页已完成任务区域

## Ordered Checklist

### 1. 新建持久化偏好 store
- [ ] 创建 `src/lib/stores/projectUiPrefs.store.ts`
- [ ] Zustand + `persist` 中间件，localStorage key `taskora-project-ui-prefs`
- [ ] state: `completedPanelExpanded: Record<string, boolean>`
- [ ] action: `setCompletedPanelExpanded(projectId, expanded)`
- [ ] 参考 `theme.store.ts` 的 persist 模式

### 2. 新增 i18n key
- [ ] `zh/project.json` 加 `"completed": "已完成"`
- [ ] `en/project.json` 加 `"completed": "Completed"`
- [ ] 运行 key parity 校验确认 zh/en 一致

### 3. 新建 ProjectCompletedTasks 组件
- [ ] 创建 `src/components/project/ProjectCompletedTasks.tsx`
- [ ] Props: `{ projectId: string }`
- [ ] 内部调用 `useTasksQuery({ projectId, completed: true })`
- [ ] 前端过滤 `status === COMPLETED && trashedAt === null`
- [ ] 过滤后空数组 → 返回 `null`（整块不显示）
- [ ] 读取 `useProjectUiPrefsStore` 的 `completedPanelExpanded[projectId]`（默认 false）
- [ ] 渲染折叠条头（toggle button + ChevronRight + 「已完成 (N)」）
- [ ] 展开时渲染 `TaskItem` 列表（折叠态，传 `onToggleComplete` 调 `useUncompleteTask`，不传 `onRowClick`）
- [ ] 加载中（`isLoading`）→ 返回 `null`
- [ ] 错误态（`isError`）→ 返回 `null`（静默失败）

### 4. 集成到 ProjectDetail
- [ ] 在 `ProjectDetail.tsx` 的 `ProjectTaskLayout` 下方渲染 `<ProjectCompletedTasks projectId={id ?? ''} />`
- [ ] 位置：在加载/错误分支之后，作为页面底部独立区块

### 5. 编写组件测试
- [ ] 创建 `src/components/project/ProjectCompletedTasks.test.tsx`
- [ ] 测试用例：
  - 无已完成任务时不渲染
  - 有已完成任务时显示 toggle 条 + 计数
  - 点击 toggle 展开/收起列表
  - 点击 checkbox 调用 uncomplete mutation
  - 持久化偏好生效（mock store）

### 6. 质量门验证
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`

## Validation Commands

```bash
# 在 packages/frontend 下运行
pnpm lint
pnpm typecheck
pnpm test

# i18n key parity 校验
for f in common nav task project area tag auth search theme; do
  diff <(jq -S 'keys' src/i18n/locales/zh/$f.json) \
       <jq -S 'keys' src/i18n/locales/en/$f.json) && echo "✓ $f"
done
```

## Risky Files / Rollback Points

- `ProjectDetail.tsx` — 仅追加一行引用，低风险
- `ProjectTaskLayout.tsx` — 不修改，无风险
- `TaskItem.tsx` — 不修改，复用现有 props，无风险
- 新增文件均为独立文件，删除即回滚

## Follow-up Checks

- [ ] 手动验证：完成一个任务 → 已完成区域出现该任务 → 点击 checkbox 取消完成 → 任务回到活跃区
- [ ] 手动验证：刷新页面 → 展开/收起状态保持
- [ ] 手动验证：切换语言 → 文案正确
- [ ] 手动验证：无已完成任务的项目 → 区域不显示
- [ ] spec 更新：在 `component-guidelines.md` 补充已完成区域组件约定