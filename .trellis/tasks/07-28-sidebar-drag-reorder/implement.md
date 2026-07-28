# Implement: Sidebar project/area drag-and-drop reordering

## 执行清单（按顺序）

### 1. 前置：确认依赖与现状
- [x] 确认 `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities` 已在 `packages/frontend`
- [x] 确认 `useReorderProjects` / `useReorderAreas` / `useUpdateProject` 已存在
- [x] 确认 `AreaDetail.tsx` 拖拽实现作为风格参考

### 2. 新增可拖包装组件
- [ ] 新建 `packages/frontend/src/components/layout/SortableProjectItem.tsx`
  - `useSortable({ id: \`proj:\${project.id}\` })`
  - `listeners` 挂外层 div（不直接挂 ProjectItem 的 button），保留点击导航
  - 透传 transform/transition/isDragging 样式
- [ ] 新建 `packages/frontend/src/components/layout/SortableAreaRow.tsx`
  - `useSortable({ id: \`area:\${area.id}\` })`
  - 内部渲染 `SidebarAreaRow`（含其 chevron 折叠与 NavLink 导航）
  - listeners 挂外层 div

### 3. 改造 SidebarAreaRow
- [ ] 内部项目列表外层包 `SortableContext items={areaProjectIds} strategy=verticalListSortingStrategy`
- [ ] 独立渲染 `SortableProjectItem`（不再直接用 ProjectItem）
- [ ] 保持折叠/展开与导航逻辑不变

### 4. 改造 SidebarProjectSection
- [ ] 引入外层 `DndContext`：`sensors = useSensors(PointerSensor distance:5)`、`collisionDetection=closestCenter`
- [ ] 包裹顶部独立项目 `SortableContext items={standaloneProjIds}`
- [ ] 区域列表 `SortableContext items={areaIds}`
- [ ] 实现 `onDragEnd`：
  - 区域-区域：`reorderAreas.mutate(newAreaIds)`
  - 项目-区域：`updateProject` 改 areaId -> onSettled reorderProjects
  - 项目-项目（跨区域）：`updateProject` 改 areaId -> onSettled reorderProjects
  - 项目-项目（同列表）：`reorderProjects.mutate(newGlobalProjectIds)`
- [ ] 实现 id 前缀解析（`proj:` / `area:`）

### 5. ProjectItem 视觉态（可选）
- [ ] 给 `ProjectItem` 加 `isDragging?: boolean` prop，拖拽中降低透明度 / 高亮边框
- [ ] 不改变其它既有渲染行为

### 6. 验证
- [ ] `pnpm --filter @taskora/frontend typecheck`
- [ ] `pnpm --filter @taskora/frontend lint`
- [ ] `pnpm --filter @taskora/frontend test`（若有相关测试）
- [ ] 手动对照 Acceptance Criteria 自查（实现侧无法运行 dev 时，由 reviewer 用 dev 服务验证）

## 验证命令

```bash
cd /home/maplume/projects/Taskora
pnpm --filter @taskora/frontend typecheck
pnpm --filter @taskora/frontend lint
pnpm --filter @taskora/frontend test
```

## 回滚点

- 改动仅限前端 4-5 个文件，回滚即 `git checkout -- packages/frontend/src/components/layout/ packages/frontend/src/components/project/ProjectItem.tsx`。
- 无 schema / 后端变更，无需 DB 回滚。

## Review Gates

- Step 2-4 完成后：dispatch `trellis-check` 做质量检查（typecheck/lint + 需求覆盖核对）。
- 验收对照 `prd.md` Acceptance Criteria。
