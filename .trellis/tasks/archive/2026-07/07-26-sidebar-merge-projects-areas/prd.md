# 合并侧边栏项目与区域区域，删除 index 页面与路由

## Goal

将侧边栏原本独立的「项目」与「区域」两个 section 合并为一个以「项目」为标题的统一区域：顶部列出无区域归属的项目，下方每个区域作为带折叠按钮的条目，自身可点击进入区域详情页，展开后显示属于该区域的项目条目。同时删除不再需要的 `/projects`、`/areas` index 页面与路由（详情页 `/projects/:id`、`/areas/:id` 保留）。

## Background

- `Sidebar.tsx` 当前用两个 `CollapsibleSection` 分别渲染项目列表和区域列表，每个 section header 是导航链接（`/projects`、`/areas`）。
- 项目实体有 `areaId` 字段，可归属到区域；`AreaDetail.tsx` 已存在"区域下项目列表"的渲染模式（`allProjects.filter(p => p.areaId === id)` + `ProjectItem`）。
- `/projects`、`/areas` 路由分别对应 `pages/Projects.tsx`、`pages/Areas.tsx`，作为 list 管理页。底栏 `SidebarBottomBar` 新增菜单已直接创建实体并跳详情页，不依赖 index 页。
- 合并后用户不再需要独立的 list 管理页入口。

## Requirements

- R1. 侧边栏「项目」「区域」合并为一个 section，section 标题为「项目」（`nav:projects`），该标题为纯展示：无折叠按钮、无导航链接。
- R2. 合并后 section 内容顺序：
  - R2a. 顶部列出 `areaId` 为空（含 null/undefined）的项目条目，样式与现有项目条目一致，可点击进入 `/projects/:id`。
  - R2b. 下方按区域顺序列出每个区域为一条目：
    - 区域条目本身可点击，进入 `/areas/:id`。
    - 区域条目右侧带折叠按钮（chevron），默认展开状态与现有 section 行为一致（默认展开）。
    - 展开后以缩进列表显示属于该区域（`areaId === area.id`）的项目条目，样式与顶部项目条目一致。
    - 区域下无项目时，展开内容显示空态提示（「该区域下没有项目」/ `area:noProjects`）。
- R3. 删除 `/projects`、`/areas` 两条 index 路由，删除 `pages/Projects.tsx`、`pages/Areas.tsx` 两个页面文件。
- R4. 保留 `/projects/:id`、`/areas/:id` 详情页路由与页面。
- R5. 清理仅被删除页面 / 被移除 section 使用的无引用 i18n 键（如 `nav:emptyAreas`、`nav:emptyProjects`、`area:empty`、`project:empty`、`nav:areas` 若不再被引用）；保留仍被详情页或底栏使用的键。
- R6. 不改动 `SidebarBottomBar`「新增项目/区域」行为（仍创建空标题并跳详情页），不改动后端、不改动详情页内部逻辑。

## Acceptance Criteria

- [ ] AC1. 侧边栏只存在一个「项目」标题区域，标题无折叠按钮、无导航链接，点击标题无行为。
- [ ] AC2. 顶部列出无区域归属的项目，点击可进入对应 `/projects/:id`。
- [ ] AC3. 每个区域以带 chevron 折叠按钮的条目出现，点击区域条目本身进入 `/areas/:id`；点击 chevron 仅切换展开/收起，不导航。
- [ ] AC4. 展开某区域后，可见属于该区域的项目条目，样式与顶部项目条目一致，点击进入 `/projects/:id`。
- [ ] AC5. 某区域无项目时，展开后显示「该区域下没有项目」空态文案。
- [ ] AC6. `/projects`、`/areas` 路由不再存在，直接访问返回 404 / 兜底页。
- [ ] AC7. `/projects/:id`、`/areas/:id` 详情页仍可正常进入，标题内联编辑、任务列表、区域下项目列表正常工作。
- [ ] AC8. 项目/区域的新增（底栏菜单）、拖拽排序（详情页内）不受影响。
- [ ] AC9. 无引用的 i18n 键已清理（zh/en），构建无未使用 key 报错（若有 lint 规则）。
- [ ] AC10. `.trellis/spec/frontend` 相应条目（如 component-guidelines / directory-structure）已更新，不再提及已删除的 index 页面路由。

## Out of Scope

- 后端接口、数据模型改动。
- 项目/区域实体的拖拽排序在侧边栏内的支持（当前侧边栏条目不支持拖拽，本次不引入）。
- 顶部"无区域项目"与区域之间、区域之间的拖拽排序。
- 详情页内部布局改动。
- 底栏新增菜单交互改动。

## Technical Notes

- `Sidebar.tsx` 用 `useProjectsQuery`、`useAreasQuery`，合并后仍用这两个 hook，本地用 `projects.filter(p => !p.areaId)` 拆分。
- 区域下项目列表渲染可直接复用 `ProjectItem` 组件（已具备点击导航与空标题占位符）。
- 区域条目是新的小组件，需同时承载导航点击与折叠切换两种交互（参考现有 `CollapsibleSection` 的折叠按钮实现）。
- 删除 `Projects.tsx` 后 `ProjectItem` 仍被 `AreaDetail.tsx` 使用，不可一并删除。
