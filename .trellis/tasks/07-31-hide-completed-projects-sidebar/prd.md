# Hide completed projects from sidebar

## Goal

侧边栏的项目列表不应展示已完成（`status === COMPLETED`）的项目。已完成项目仍可在其它视图（如项目详情、对应 feed 视图）访问，只是不再出现在侧边栏导航树中。

## Background

- 项目数据模型有 `status: ProjectStatus`，取值为 `ACTIVE` | `COMPLETED`。
- 后端 `ProjectsService.findAll` 已过滤 `trashedAt != null`，但仍返回所有 `status` 的项目。
- 前端 `Sidebar.tsx` 用 `useProjectsQuery()` 拿到全部项目后直接传给 `SidebarProjectSection`，未按 `status` 过滤，导致已完成项目仍显示在侧边栏。

## Requirements

1. 侧边栏项目列表（含独立项目与各 Area 分组下的项目）不显示 `status === COMPLETED` 的项目。
2. 过滤仅作用于侧边栏展示；不改变后端 `findAll` 的返回内容（其它视图可能需要已完成项目）。
3. 拖拽排序逻辑不受影响：`computeReorderedGlobalIds` 接收的是侧边栏可见项目子集，后端 `reorder` 只更新传入 id 的 `sortOrder`，传子集是安全的，无需额外处理。
4. 不改变已完成项目的可访问性：用户仍可通过直接 URL / 详情页访问已完成项目。

## Acceptance Criteria

- [ ] 侧边栏中不出现 `status === COMPLETED` 的项目（无论是否归属 Area）。
- [ ] 完成项目（`useCompleteProject`）后，该项目从侧边栏消失。
- [ ] 取消完成（`useUncompleteProject`）后，项目重新出现在侧边栏。
- [ ] 拖拽排序、跨 Area 移动等交互在仅显示 ACTIVE 项目的情况下仍正常工作。

## Notes

- 实现位置：`packages/frontend/src/components/layout/Sidebar.tsx`，对传入 `SidebarProjectSection` 的 `projects` 做过滤即可。
- 无需新增 design.md / implement.md（轻量任务）。
