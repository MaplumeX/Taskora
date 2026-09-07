# 实施计划：移动端适配

前置：`pnpm --filter frontend lint && pnpm --filter frontend typecheck && pnpm --filter frontend test` 全绿（基线）。

## 阶段 1：导航基础设施

- [x] 1.1 提取 `mainNav` 到 `components/layout/navItems.ts`；Sidebar 改为从该文件导入（行为不变）。
- [x] 1.2 从 `ContentBottomBar.tsx` 提取 `lib/hooks/useContentBottomActions.ts`；ContentBottomBar 改为消费 hook（行为不变）。
- [x] 1.3 验证：`pnpm --filter frontend test && typecheck`；手动确认桌面无变化。

## 阶段 2：手机导航组件

- [x] 2.1 新建 `MobileTabBar.tsx`（4 标签 + 更多，`md:hidden`，safe-area padding）。
- [x] 2.2 新建 `MobileNavDrawer.tsx`（底部抽屉：剩余主导航、SidebarProjectSection、标签、回收站、设置、账号）。
- [x] 2.3 新建 `MobileTopBar.tsx`（sticky 搜索入口，打开 SearchModal）。
- [x] 2.4 新建 `MobileFab.tsx`（消费 useContentBottomActions；addProject/addHeading 场景用朝上弹出的菜单）。
- [x] 2.5 `AppShell.tsx` 集成：Sidebar/ContentBottomBar `hidden md:flex`，挂载手机组件，内容区底部留白。
- [x] 2.6 验证：lint/typecheck/test 全绿；已补 MobileTabBar/MobileNavDrawer 渲染测试（2.3 项）；375px 视口手动巡检待主会话 dev server 验证。

## 阶段 3：弹窗与通用响应式

- [ ] 3.1 `ui/dialog.tsx`：DialogContent 手机端近全宽（`w-[calc(100vw-1.5rem)] max-w-none md:max-w-xl` 之类的通用手机样式）。
- [ ] 3.2 `SearchModal` / `SettingsModal` 手机端样式（SettingsModal 侧栏改手机端顶部标签行）。
- [ ] 3.3 `MainContent` padding 手机端 `px-4`，日历 canvas `px-3`。
- [ ] 3.4 验证：手机端打开/滚动/关闭搜索与设置弹窗。

## 阶段 4：日历与任务列表

- [ ] 4.1 `CalendarMonthGrid` 手机端：短星期表头（补 i18n 键）、单元格 `minmax(64px,1fr)`、任务行截断缩略。
- [ ] 4.2 `TaskItem`：手机端操作按钮 `hidden md:flex`，标题/徽章截断换行。
- [ ] 4.3 `TaskRowExpanded`：手机端单列堆叠（`flex-col md:flex-row`）。
- [ ] 4.4 风险 fallback：若 4.1 不可读，改为单元格仅显示数量、点按弹当日任务列表（需回到本文件更新计划后再做）。
- [ ] 4.5 验证：375px 下日历页、任务列表、展开行无横向溢出。

## 阶段 5：剩余页面排查

- [ ] 5.1 排查并修复 Tags / Trash / Login / Register / Logbook / Upcoming / Anytime / Someday / Area/Project/Tag 详情页的固定宽度与横向溢出。
- [ ] 5.2 全路由 375px 巡检（dev server 手动过一遍），记录发现的问题并修复。
- [x] 5.3 新组件补充基础渲染测试（MobileTabBar active 态、MobileNavDrawer 打开与链接跳转）。（在阶段 2 已一并完成）

## 阶段 6：收尾

- [ ] 6.1 全量验证：`pnpm --filter frontend lint && typecheck && test`。
- [ ] 6.2 对照 PRD Acceptance Criteria 逐条核验。
- [ ] 6.3 桌面端（≥768px）关键页面人工比对无回归。

## 验证命令

```bash
pnpm --filter frontend lint
pnpm --filter frontend typecheck
pnpm --filter frontend test
pnpm --filter frontend dev   # 手动 375px / 1280px 巡检
```

## 风险文件与回滚点

- 高风险：`AppShell.tsx`、`ContentBottomBar.tsx`（重构）、`ui/dialog.tsx`（全局弹窗样式）。
- 每阶段独立 commit，可按阶段 revert。
