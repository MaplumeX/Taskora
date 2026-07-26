# Implement: 合并侧边栏项目与区域

## 执行清单

### 1. 新建侧边栏子组件
- [ ] 1.1 新建 `src/components/layout/SidebarProjectSection.tsx`：
  - props `{ projects: ProjectResponseDto[]; areas: AreaResponseDto[] }`。
  - 标题行纯文本 `t('nav:projects')`（无 NavLink、无折叠按钮）。
  - 子内容：顶层无区域项目（`projects.filter(p => !p.areaId)`）映射 `ProjectItem`；区域映射 `SidebarAreaRow`。
  - 顶层项目为空时不渲染该区块，但仍渲染区域列表（若 areas 非空）。
- [ ] 1.2 新建 `src/components/layout/SidebarAreaRow.tsx`：
  - props `{ area: AreaResponseDto; projects: ProjectResponseDto[] }`。
  - 导航主体 `<NavLink to={\`/areas/${area.id}\`}>`：Layers 图标 + `area.title || t('area:newItemPlaceholder')`。
  - chevron `<button>`：`onClick` 仅切换 `open`，`stopPropagation`。
  - `open &&` 子列表：`ProjectItem` 列表；空时显示 `t('area:noProjects')`。
  - 视觉规格与原 `CollapsibleSection` 缩进/border-l 一致。

### 2. 重构 Sidebar.tsx
- [ ] 2.1 移除原两个 `CollapsibleSection`（项目 + 区域）及相关 props。
- [ ] 2.2 在原两 section 位置替换为单个 `<SidebarProjectSection projects={projects} areas={areas} />`。
- [ ] 2.3 移除两 section 之间的 `<Separator>`；保留与 tags、trash 之间的分隔线。
- [ ] 2.4 移除不再使用的 import（`Layers` 若迁移到 `SidebarAreaRow` 则从 Sidebar 移除；`Folder` 同理；`CollapsibleSection` 定义若不再复用则删除）。
- [ ] 2.5 `useProjectsQuery`、`useAreasQuery`、`useTagsQuery` 保留；`useTagsQuery` 仍用于 tags section。

### 3. 删除 index 页面与路由
- [ ] 3.1 `src/router.tsx`：删除 `{ path: '/projects', element: <Projects /> }` 与 `{ path: '/areas', element: <Areas /> }` 两行，及对应 lazy import。
- [ ] 3.2 删除 `src/pages/Projects.tsx`。
- [ ] 3.3 删除 `src/pages/Areas.tsx`。
- [ ] 3.4 确认 `ProjectItem` 仍被 `AreaDetail.tsx` 引用，不删除 `ProjectItem`。
- [ ] 3.5 确认 `AreaItem`、`ProjectForm`、`AreaForm` 等组件在删除页面后是否仍有引用；若无引用则一并清理（grep 确认）。

### 4. i18n 清理
- [ ] 4.1 zh/en `nav.json`：删除 `emptyProjects`、`emptyAreas`、`areas`（二次 grep 确认无引用后删；若 `nav:areas` 有其他引用则保留）。
- [ ] 4.2 zh/en `project.json`：删除 `empty`（确认无引用）。
- [ ] 4.3 zh/en `area.json`：删除 `empty`（确认无引用）；保留 `noProjects`、`projectsLabel`、`newItemPlaceholder` 等。

### 5. 验证
- [ ] 5.1 `pnpm --filter frontend build` 通过，无 TS 报错、无未使用变量/导入。
- [ ] 5.2 `pnpm --filter frontend lint`（若有）通过。
- [ ] 5.3 手动验证（dev server）：
  - 侧边栏只有一个「项目」标题，无折叠/无链接。
  - 无区域项目在顶部列出，点击进详情。
  - 每个区域带 chevron，点击区域名进区域详情，点击 chevron 展开/收起。
  - 展开后见该区域下项目，点击进项目详情；空区域显示「该区域下没有项目」。
  - 访问 `/projects`、`/areas` 落到 404。
  - `/projects/:id`、`/areas/:id` 正常。
  - 底栏新增项目/区域仍工作。
- [ ] 5.4 截图 / 录屏 留档（可选）。

### 6. Spec 更新（Phase 3.3 前置准备）
- [ ] 6.1 `.trellis/spec/frontend/component-guidelines.md`：移除对 `/projects`、`/areas` index 页面的引用（若有），更新 sidebar 段落描述合并结构。
- [ ] 6.2 `.trellis/spec/frontend/directory-structure.md`：更新 pages 列表（移除 Projects.tsx / Areas.tsx）。

## 验证命令

```bash
# 构建
pnpm --filter frontend build
# 类型检查（若 build 不含）
pnpm --filter frontend exec tsc --noEmit
# 引用确认
grep -rn "pages/Projects\|pages/Areas\|nav:emptyProjects\|nav:emptyAreas\|nav:areas\|area:empty\b\|project:empty\b" packages/frontend/src
# dev 验证
pnpm --filter frontend dev
```

## 风险与回滚点

| 风险 | 缓解 |
|------|------|
| 删除页面后有遗漏引用导致 build 失败 | implement 3.5 grep 确认；build 必过 |
| i18n key 被动态引用（如 `t(\`nav:${x}\`)`)）导致误删 | grep `nav:` 动态拼接模式确认；当前代码未见动态拼接 |
| `nav:areas` 可能在其他地方作为文案使用 | grep `nav:areas` 全量确认后再决定 |

回滚：单 commit 涉及 4-6 文件，`git revert` 即可。
