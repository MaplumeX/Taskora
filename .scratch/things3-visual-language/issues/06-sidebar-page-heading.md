# 06: 侧边栏与页面标题

Status: done
Blocked by: 03

## 内容

1. `Sidebar` 及 `SidebarAreaRow` / `SidebarProjectSection` / `SortableProjectItem` / `SidebarBottomBar`：`bg-sidebar`、去右边框与 Separator、行高 28px、彩色 Bucket 图标、选中态、Today 逾期红色计数胶囊、Project 进度环 14px。
2. `PageHeading`：`title-1`，桌面也显示 Bucket 彩色图标；Project / Area 详情标题前显示对应图标。
3. `MobileTopBar` / 手机首页列表与之对齐。

## 验收标准

- [x] 桌面侧边栏截图（亮 / 暗）符合 spec；拖拽排序仍可用
- [x] `SidebarProjectSection` 测试全绿

## Comments

- 2026-09-27：完成。行样式收敛为 `layout/sidebarRowClass.ts`（Sidebar / 区域行 / Tags 子项 / 项目行共用）；`ProjectItem` 新增 `variant="sidebar"`（16px 进度环、按路由高亮当前项目），`ProjectProgressRing` 新增 `size`。去掉所有 Separator 与嵌套竖线，分组靠 16px 留白；折叠 chevron 仅 hover 显示（手机常显）。Assistant / Logbook / Trash 补图标色。未做：Today 逾期红色计数胶囊（目前没有逾期计数数据，另议）、Project / Area 详情标题前的图标（归入 09）。
