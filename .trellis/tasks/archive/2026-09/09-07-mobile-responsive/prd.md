# 移动端适配：底部标签栏与响应式布局

## Goal

让 Taskora 前端在手机（<768px）上可用且好用：以底部标签栏作为主导航，主要页面与弹窗自适应小屏。桌面端（≥768px）布局保持现状不变。

## Confirmed Facts（代码勘察）

- 布局：`AppShell`（`packages/frontend/src/components/layout/AppShell.tsx`）= 左侧固定 `w-60` Sidebar + 右侧 MainContent/ContentBottomBar，无任何响应式断点。
- 主导航共 7 项（Inbox/Today/Upcoming/Calendar/Anytime/Someday/Logbook），另有项目、区域、标签三组可折叠导航 + Trash + 用户菜单，全部在 Sidebar 中。
- `ContentBottomBar` 是底部功能条：搜索（Cmd+K）、添加任务/项目/标题按钮。
- 全局无任何 `@media` / Tailwind 响应式前缀（`sm:`/`md:` 等），页面、模态框（SearchModal `max-w-xl`、SettingsModal）、日历网格（`grid-cols-7` 固定 7 列）均为固定桌面布局。
- 技术栈：React 18 + Vite + Tailwind CSS + Radix UI（已有 dialog/dropdown/popover 等）+ react-router v6 + i18next。
- 用户已确认：① 目标设备为手机（<768px）；② 导航采用底部标签栏；③ 允许引入新 UI 依赖。

## Requirements

- R1 手机断点（<768px）下隐藏桌面 Sidebar，改用底部标签栏导航。
- R2 桌面端（≥768px）布局与现状完全一致，不回归。
- R3 底部标签栏固定 4 项 + 「更多」：今天（/today）、收件箱（/inbox）、日历（/calendar）、任何时间（/anytime）、更多（抽屉，收纳：最近、将来、日志、项目、区域、标签、回收站、设置、账号）。
- R4 手机端操作入口：搜索按钮放在页面顶部；添加任务采用右下角悬浮按钮（FAB），原有桌面底部功能条（ContentBottomBar）在手机端隐藏。
- R5 模态框（搜索、设置）在手机端全宽/近全屏展示，内容可滚动。
- R6 日历月视图在手机端可读（7 列网格缩放或降级方案）。
- R7 任务列表、详情展开行、各页面（Tags/Trash/登录注册等）无横向溢出，触控目标 ≥44px。

## Acceptance Criteria

- [ ] 375px 宽视口下所有路由无横向滚动条、无元素溢出视口。
- [ ] 底部标签栏可到达全部 7 个主导航 + 项目/区域/标签/回收站/设置入口。
- [ ] ≥768px 视口下布局与当前桌面版一致（人工比对关键页面）。
- [ ] 模态框在手机端可正常打开、滚动、关闭。
- [ ] `pnpm --filter frontend lint` / `typecheck` / `test` 通过。

## Out of Scope

- 平板（768–1024px）专门优化。
- 手势交互（滑动切换页面、下拉刷新等）。
- 后端 / shared 包改动。

## Decisions

- D1（用户已确认）：目标设备为手机（<768px）；导航采用底部标签栏；允许引入新 UI 依赖。
- D2（用户已确认）：标签栏组合 = 今天/收件箱/日历/任何时间 + 「更多」抽屉。
- D3（用户已确认）：手机端操作入口 = 顶部搜索按钮 + 右下角 FAB 添加任务；桌面底部功能条在手机端隐藏。
