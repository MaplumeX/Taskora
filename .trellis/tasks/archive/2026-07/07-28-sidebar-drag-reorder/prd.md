# Sidebar project/area drag-and-drop reordering

## Goal

让侧边栏「项目」区域（`SidebarProjectSection`）的条目支持拖拽，提升项目与区域的组织效率。
具体包括：独立项目排序、区域内项目排序、项目跨区域移动（改变 `areaId`）、区域间排序。

## Background

- 侧边栏目前结构（`SidebarProjectSection` → `SidebarAreaRow` → `ProjectItem`）：
  顶部列出无区域归属的独立项目，下方每个区域为一个可折叠行，展开后列出该区域的项目。
- 后端能力已齐备：
  - `POST /projects/reorder`（按 orderedIds 重设全局 sortOrder）
  - `POST /areas/reorder`（按 orderedIds 重设全局 sortOrder）
  - `PATCH /projects/:id`（支持 `areaId: string | null` 改变归属）
- 前端 hooks 已存在：`useReorderProjects`、`useReorderAreas`、`useUpdateProject`。
- dnd-kit 依赖已安装，`AreaDetail` 中已有同款拖拽范例。

## Requirements

### 功能需求

1. **独立项目排序**：顶部「无区域」项目列表内部可拖拽排序，拖拽结束后调用 `useReorderProjects` 持久化（全局 orderedIds，含所有项目）。
2. **区域内项目排序**：区域展开后其项目列表内部可拖拽排序，同样调用 `useReorderProjects`（全局 orderedIds 排序持久化）。
3. **项目跨区域移动**：项目可拖到另一区域（拖到区域标题即归属该区域；拖到区域展开的项目列表内同样归属该区域）。移动后调用 `useUpdateProject` 更新 `areaId`，随后调用 `useReorderProjects` 持久化新顺序。
4. **项目拖出区域变独立**：项目可拖到顶部「无区域」区（或顶部独立项目之间的位置），`areaId` 置为 `null`。
5. **区域间排序**：区域条目本身可拖拽排序，拖拽结束后调用 `useReorderAreas` 持久化。

### 交互/约束

- 拖拽手柄/整个条目可拖；但不应破坏既有导航点击与 chevron 折叠/展开行为。
  - 区域行：主体导航点击、chevron 折叠按钮在拖拽时不应误触。
  - 项目行：拖拽不应破坏点击跳转到项目详情。
- 拖拽需有适度激活距离（如 PointerSensor distance: 5），避免点击即拖。
- 拖拽中应有视觉反馈（透明度/drag overlay 或 transform zIndex）。
- 折叠区域的 drop 仍应生效（拖到区域标题即归属）。
- 乐观更新：保留与现有 `useReorderProjects` / `useReorderAreas` 一致的 onMutate 乐观更新风格。
- 跨区域移动时，先 `updateProject`（areaId）再触发列表重排/重取，保持 UI 与后端一致；失败需回滚（invalidate 重取）。

### 非功能需求

- 不改后端代码（现有 API 已满足）。
- 不破坏 `AreaDetail` 页面已有的拖拽行为。
- 不破坏 `SidebarProjectSection` 的视觉结构顺序：顶部独立项目 → 下方各区域。

## Acceptance Criteria

- [ ] 顶部独立项目可在彼此间拖拽排序，松手后顺序持久化（刷新后保持）。
- [ ] 区域内项目可在本区域内拖拽排序，松手后顺序持久化。
- [ ] 项目可拖到另一区域标题上，`areaId` 切换为目标区域，UI 与后端一致。
- [ ] 项目可拖到顶部「无区域」区，`areaId` 变为 `null`，UI 与后端一致。
- [ ] 区域条目可在彼此间拖拽排序，松手后顺序持久化。
- [ ] 拖拽过程中点击导航、折叠按钮、项目跳转等既有行为不被破坏。
- [ ] 拖拽有激活距离，不会因普通点击误触发。
- [ ] 拖拽有清晰视觉反馈（拖动项样式）。
- [ ] typecheck / lint / 现有测试通过。

## Notes

- 实现细节（dnd-kit 嵌套 DndContext 方案、排序/归属协同的持久化顺序）见 `design.md`。
- 执行清单见 `implement.md`。
