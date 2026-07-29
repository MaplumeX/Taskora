# 区域界面底栏添加项目按钮

## Goal

在区域详情页（`/areas/:id`）的内容区底栏（`ContentBottomBar`）中，提供一个"添加项目"按钮，使在该区域下快速创建项目成为可能，与侧边栏"新建项目"入口形成一致的创建体验。

## Requirements

- 在 `/areas/:id` 路由下，`ContentBottomBar` 除现有的"搜索"和"添加任务"按钮外，额外显示一个"添加项目"按钮。
- 点击"添加项目"按钮后：
  - 创建一个空标题项目，`CreateProjectDto.areaId` 设为当前路由的 area id。
  - 创建成功后将 `pendingAutoEditId` 设为新项目 id，并导航到 `/projects/{id}`（与侧边栏 `SidebarBottomBar.handleNewProject` 行为一致）。
  - 创建失败时弹出失败提示 toast，复用 `common:createFailed`。
- 仅在区域详情页显示该按钮；其他路由保持原有底栏行为不变。
- 按钮的国际化文案复用现有 `project:create`（"新建项目" / "Create project" 等已有键）或新增 `project:addProject`（待实现时确认）；aria-label 需有对应翻译。
- 不改动现有"添加任务"按钮逻辑及其在 `/upcoming`、`/logbook`、`/trash` 下的隐藏规则。

## Acceptance Criteria

- [ ] 访问任意区域详情页（`/areas/:id`）时，底栏可见"添加项目"按钮。
- [ ] 点击"添加项目"后，创建的项目归属于当前区域（`areaId` 正确），并跳转到该项目的详情页且标题进入自动编辑态。
- [ ] 在非区域页面（如 `/today`、`/projects/:id`、`/upcoming` 等）底栏不显示"添加项目"按钮，行为与改动前一致。
- [ ] 创建失败时显示失败 toast，按钮 disabled 态在创建请求期间生效。
- [ ] 中英文 i18n 文案齐全。
- [ ] `pnpm typecheck` 与 `pnpm lint` 通过。

## Notes

- 实现仅触及 `ContentBottomBar.tsx` 及 i18n 文件，无需后端改动（`CreateProjectDto.areaId` 已支持）。
- 与 `SidebarBottomBar.handleNewProject` 的差异仅在于携带 `areaId`。
