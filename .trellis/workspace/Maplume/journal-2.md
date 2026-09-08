# Journal - Maplume (Part 2)

> Continuation from `journal-1.md` (archived at ~2000 lines)
> Started: 2026-09-08

---



## Session 66: 移动端适配：底部标签栏与响应式布局

**Date**: 2026-09-08
**Task**: 移动端适配：底部标签栏与响应式布局
**Branch**: `emdash/dark-ways-search-ybrh7`

### Summary

前端移动端适配（<768px）完成：新增 MobileTabBar（4标签+更多）/MobileNavDrawer 底部抽屉/MobileTopBar 搜索/MobileFab 快速添加组件；提取 navItems.ts 与 useContentBottomActions 共享逻辑；弹窗/日历/任务行/全部页面响应式改造（max-md 前缀隔离，桌面零回归）；触控目标≥44px。Playwright 实机巡检 375/320px 全路由 0 溢出；修复 MobileFab 详情页不弹菜单缺陷；189 测试全绿；移动端约定已沉淀至 frontend spec。

### Git Commits

| Hash | Message |
|------|---------|
| `e9b07fb` | (see git log) |
| `87e179d` | (see git log) |
| `4e75844` | (see git log) |
| `3262841` | (see git log) |

### Status

[OK] **Completed**


## Session 67: Fix sidebar hover transition lag

**Date**: 2026-09-08
**Task**: Fix sidebar hover transition lag
**Branch**: `emdash/sharp-jobs-greet-96qtx`

### Summary

研究侧边栏 hover 不跟手问题：根因是条目 className 的 transition-colors（150ms 渐入渐出）让高亮追不上光标。在 index.css 新增 .hover-instant utility（进入即时高亮、离开 150ms 淡出、reduced-motion 禁用），替换 Sidebar/SidebarAreaRow/ProjectItem 共 5 处；同步更新 frontend component-guidelines 样式约定。lint/typecheck/189 测试全过。

### Git Commits

| Hash | Message |
|------|---------|
| `783c7d5` | (see git log) |

### Status

[OK] **Completed**
