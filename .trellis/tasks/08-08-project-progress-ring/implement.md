# Implement: Project Progress Ring Checkbox

## 执行清单（按序）

### Backend

- [ ] 1. `packages/shared/src/dtos/project.dto.ts`: `ProjectResponseDto` 追加 `taskTotalCount: number` + `taskCompletedCount: number`
- [ ] 2. `packages/shared/src/dtos/feed.dto.ts`: `ProjectFeedItem` 追加同样两字段
- [ ] 3. `packages/backend/src/projects/projects.service.ts`:
  - [ ] 3a. `findAll`: 在 `findMany` 后用两次 `task.groupBy`（一次总数、一次 `status: COMPLETED`）批量统计，组装进返回值
  - [ ] 3b. `findOne`: 对单项目用两次 `task.aggregate`（`_count _all` 与 `_count` where completed）或 groupBy，注入统计
  - [ ] 3c. `create` / `update` 返回值也需带统计（新建项目 total=0/completed=0；update 后需重算当前项目统计）
- [ ] 4. `packages/backend/src/feed/feed.service.ts`: project 映射处用两次 `task.groupBy` 注入 `taskTotalCount` / `taskCompletedCount`

### Frontend

- [ ] 5. 新建 `packages/frontend/src/components/project/ProjectProgressRing.tsx`:
  - SVG 环形（18×18, r=7, strokeWidth=2, `strokeDasharray`/`offset` 实现进度）
  - 满环 + 中心 `Check`（isDone 时）
  - `button` 包裹，`onClick` stopPropagation + onToggle
  - props: `{ total, completed, projectStatus, onToggle, disabled? }`
  - hover / active 样式与 `TaskCheckbox` 对齐
- [ ] 6. `packages/frontend/src/components/project/ProjectItem.tsx`:
  - 移除 `Folder` import，引入 `ProjectProgressRing` + `useCompleteProject` / `useUncompleteProject`
  - 用 `ProjectProgressRing` 替换 `<Folder>`
  - `onToggle` = 完成/恢复项目（mutate 带 onError toast）
  - 已完成态文字加 line-through + muted-foreground
- [ ] 7. `packages/frontend/src/components/feed/ProjectFeedRow.tsx`:
  - 移除 `Folder` import，引入 `ProjectProgressRing` + `useCompleteProject` / `useUncompleteProject`
  - 用 `ProjectProgressRing` 替换 `<Folder>`
  - `onToggle` = 完成/恢复项目
  - 已完成态视觉逻辑保留
- [ ] 8. i18n: `ProjectProgressRing` 的 aria-label 复用 `project:markComplete` / `project:markIncomplete`（若 key 不存在则用 `task:markComplete` fallback，确认 i18n key）

### Quality Gates

- [ ] 9. 后端单测：`projects.service` 统计值正确（mock prisma groupBy 返回）；若现有 service 无单测则跳过新增，依赖 e2e
- [ ] 10. 前端类型检查：`pnpm -F @taskora/frontend tsc --noEmit`
- [ ] 11. 后端类型检查 + build：`pnpm -F @taskora/backend build`
- [ ] 12. 前端 lint：`pnpm -F @taskora/frontend lint`
- [ ] 13. 前端既有测试通过：`pnpm -F @taskora/frontend test`（含 `ProjectTaskLayout.test.tsx` 等）
- [ ] 14. 手动验证点：空项目（total=0）显示空环；部分完成显示部分环；全完成/已标记完成显示满环+勾；点击环切换状态；点击文字导航不变

## 回滚点

- 任何阶段失败：`git checkout -- <files>` 恢复，无 schema migration 需回滚
- DTO 字段保留无害，回滚时只需恢复前端组件即可恢复视觉

## Review Gates

- 后端统计口径正确性（trashedAt 过滤、不混入子任务、两次 groupBy 无 N+1）
- 前端环形 SVG 数学正确（`2πr` dasharray，offset 计算）
- 点击事件 stopPropagation 不破坏外层导航