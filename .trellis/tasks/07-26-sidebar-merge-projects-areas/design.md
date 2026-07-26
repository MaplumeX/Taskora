# Design: 合并侧边栏项目与区域

## 架构与边界

改动范围仅限前端 `packages/frontend`：

```
src/
├── components/layout/
│   ├── Sidebar.tsx           # 重构 section 结构
│   └── SidebarBottomBar.tsx  # 不变
├── components/sidebar/       # 新增（若无此目录则放 layout 旁）
│   ├── ProjectSection.tsx    # 新：合并后的统一「项目」section
│   └── AreaRow.tsx            # 新：可折叠的区域条目（含项目子列表）
├── pages/
│   ├── Projects.tsx          # 删除
│   └── Areas.tsx             # 删除
└── router.tsx                # 删除 /projects、/areas 两条 index 路由
```

> 目录约定：Taskora 现状把侧边栏组件放在 `components/layout/`。新组件遵循同目录，命名为 `SidebarProjectSection.tsx`、`SidebarAreaRow.tsx`，避免引入新目录层级。最终位置在 implement 阶段确认，保持与现有 `Sidebar`、`SidebarBottomBar` 同级。

## 数据流

```
Sidebar
 ├─ useProjectsQuery()  → projects[]
 ├─ useAreasQuery()     → areas[]
 └─ <SidebarProjectSection projects areas />
     ├─ 顶层项目 = projects.filter(p => !p.areaId)   → <ProjectItem />
     └─ areas.map(area =>
          <SidebarAreaRow area projects={projects.filter(p => p.areaId === area.id)}>
            ├─ 区域标题行：点击 → navigate(`/areas/${area.id}`)
            ├─ chevron 按钮：仅 setOpen(!open)
            └─ open && 子项目列表 → <ProjectItem />（空态用 area:noProjects）
        )
```

## 组件契约

### `<SidebarProjectSection>`

- props: `{ projects: ProjectResponseDto[]; areas: AreaResponseDto[] }`
- 渲染：
  - 标题行：纯文本 `t('nav:projects')`，无 NavLink、无折叠按钮。
  - 子内容容器（带左侧缩进 border-l，与原 `CollapsibleSection` 视觉延续）：
    - 无区域项目列表（顺序按 `projects` 原始顺序，后端已维护排序）。
    - 区域条目列表（顺序按 `areas` 原始顺序）。
- 无空态：当 projects 与 areas 均为空时不显示空提示（section 整体可省略或显示标题即可）；顶层项目为空时该部分不渲染。区域为空时不渲染任何 `SidebarAreaRow`。

### `<SidebarAreaRow>`

- props: `{ area: AreaResponseDto; projects: ProjectResponseDto[] }`
- state: `open`（默认 `true`，与原 `CollapsibleSection` 一致）。
- 渲染：
  - 行容器 `relative flex items-center`：
    - 左侧主体 `<NavLink to="/areas/:id">`：显示 Layers 图标 + `area.title || t('area:newItemPlaceholder')`，样式与原 section header 一致。
    - 右侧 `<button>` chevron：`onClick` 仅切换 `open`，`stopPropagation` 避免触发 NavLink。
  - `open &&` 子列表：缩进 + border-l，渲染 `projects.map(p => <ProjectItem ... />)`；`projects.length === 0` 时显示 `t('area:noProjects')`。
- 项目条目直接复用 `ProjectItem`（已实现点击导航 `/projects/:id`、空标题占位符）。
- 区域图标：沿用原区域 section 的 `Layers` 图标，保持视觉连续性。

## 路由变更

`router.tsx`：

| 路由 | 改动 |
|------|------|
| `/projects` | 删除（含 `Projects` 组件 import） |
| `/projects/:id` | 保留 |
| `/areas` | 删除（含 `Areas` 组件 import） |
| `/areas/:id` | 保留 |

## i18n 清理

删除（删除页面 + 合并 section 后无引用，已通过 grep 验证）：

| key | zh 值 | 原引用 |
|-----|------|--------|
| `nav:emptyProjects` | — | Sidebar.tsx（合并后不再用） |
| `nav:emptyAreas` | — | Sidebar.tsx |
| `area:empty` | 暂无区域 | Areas.tsx（删除） |
| `project:empty` | No projects | Projects.tsx（删除） |
| `nav:areas` | 区域 | Areas.tsx 标题 + Sidebar 原区域 section header |

保留：

- `nav:projects` — 合并后 section 标题。
- `area:noProjects`、`area:projectsLabel` — `AreaDetail.tsx` 仍在用。
- `area:newItemPlaceholder`、`project:newItemPlaceholder` — 空标题占位符。
- `common:newArea`、`common:newProject` — 底栏新增菜单。

> 注：`nav:areas` 在合并后的侧边栏不再出现（区域条目显示区域自身标题而非"区域"标签）。若评估后希望保留以备他用，可暂留；但本任务范围倾向于清理无引用键，故删除。最终在 implement 阶段以 grep 二次确认无引用为准。

## 兼容性与回滚

- 兼容性：删除 `/projects`、`/areas` 路由后，已收藏或历史访问这两个路径的用户会落到兜底页（已有 `*` 404 路由）。详情页链接不受影响。
- 回滚点：本任务改动集中在前端 4 个文件（Sidebar、router、删除 2 页面、i18n），git revert 单 commit 即可回滚。

## Trade-offs

- **不引入侧边栏内拖拽排序**：保持现状（侧边栏条目不可拖拽），详情页内仍支持拖拽。合并后的视觉顺序由后端 `order` 字段决定。若未来需要在侧边栏直接排序，可基于此结构扩展，不影响本次方案。
- **默认展开区域**：与原 `CollapsibleSection` 行为一致（`open=true`），避免用户首次看到折叠的空树。区域较多时可能纵向较长，但侧边栏已有 `ScrollArea`。
- **不显示 section 级空态**：合并后若项目和区域都为空，section 仅显示标题，依赖底栏「新增」菜单引导创建。与 Things3 行为一致。
