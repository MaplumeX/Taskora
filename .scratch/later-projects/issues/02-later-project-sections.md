# 02: Later Projects 页与共享分节组件

Status: done
Blocked by: 01

## 内容

- 共享组件 `LaterProjectSections`：输入一组稍后项目，按 `laterProjectKind` 分成「计划」「Someday」两节；空节不显示标题。「计划」按计划日期升序（同日按 sortOrder），「Someday」按 sortOrder；两节均无拖拽。行复用 `ProjectItem`，接入 `useSelectionScope`（kind: 'project'）。
- 新页面 `packages/ui/src/pages/LaterProjects.tsx`：标题「稍后项目」，内容为**无区域**的稍后项目；全空时显示空态。
- 路由 `/later-projects` 加到 `packages/frontend/src/router.tsx`、`packages/desktop/src/MainApp.tsx`、`packages/mobile/src/MainApp.tsx`（窄屏走 MobileTopBar 返回逻辑）。
- i18n：页面标题、两个小节标题、空态文案（zh / en）。

## 验收标准

- [x] 组件测试：分节正确、空节隐藏、计划按日期升序、无拖拽手柄
- [x] 页面只列无区域的稍后项目
- [x] 路由可达；键盘 ↑/↓ 可遍历、Enter 进入项目详情（2026-09-28 网页版实测；桌面 / 移动端路由已注册但未实机验证）

## Comments

- 2026-09-28：完成。`LaterProjectSections` + `laterProjectLayout.ts`（`groupLaterProjects`），页面 `pages/LaterProjects.tsx`，三端路由 `/later-projects`。`ProjectItem` 新增 `showScheduledBadge`。分节组件带 `registerSelection` 开关，供区域页并入自身 scope 保证遍历顺序。
- 2026-09-28：网页版实测（Playwright）：侧边栏「2 个稍后项目」入口位于无区域项目末尾，点击进入 Later Projects 页并高亮；页面「计划」（带 11月15日 chip）/「将来」分节正确；↑/↓ 按 计划 → 将来 顺序选中，Enter 进入项目。
- 2026-09-28：按用户要求，侧边栏 Upcoming 的中文名「近期」改为「计划」（`nav:upcoming`）；两个小节标题直接复用侧边栏 Upcoming / Someday 的名称、图标与颜色（`navItems.mainNav`），去掉单独的 `project:laterScheduled` 文案。网页版截图确认。
