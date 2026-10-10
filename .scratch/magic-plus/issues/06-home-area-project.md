# 06 首页拖进区域新建项目

Status: implemented — awaiting device acceptance
Blocked by: 02

## Problem

首页只能新建顶层项目，进区域还得再移动。

## Design

见 spec「首页：拖进区域新建项目」。

- 首页项目 / 区域列表（复用侧边栏组件的排序 surface）认领 Magic Plus：落点在某区域内 → 在该区域新建项目，位于落点；在无区域段 → 顶层项目。
- 新建后同菜单「新增项目」：进入项目页编辑标题。
- 首页其余部分（Inbox / Today 等入口）不是落点。首页点按菜单不变。

## Acceptance

- 拖到「工作」区域的两个项目之间 → 新项目属于「工作」，位于该处，跳到项目页。
- 拖到 Today 入口上松手 = 取消。

## Comments

### 2026-10-10 — 实现

- 首页的项目 / 区域列表在首页自己的 `AppDndProvider` 里（与隐藏的桌面侧边栏同 id，必须隔开），应用壳的按钮拖不进去。改为：`MobileFab` 加 `scope`，应用壳的按钮在 `/home` 让位，Home 在自己的拖拽上下文里渲染 `scope="home"` 的按钮。
- 有菜单也能拖：菜单改为点击时打开（`DropdownMenuTrigger` 上拦下 Radix 的按下即开；拖拽源的按下处理先执行），按下后移动即拖动；拖动后的 click 由 dnd-kit 吞掉，不会弹菜单。
- 按钮只在当前页有列表接收 Magic Plus 时可拖（provider 新增 `magicPlusAvailable`，surface 的 `magicPlus` 变化时重新登记）。区域页的任务列表（`TaskList`）不接收，所以区域页仍只能点按弹菜单。
- `SidebarProjectSection` 加 `magicPlus`（只有首页传）：草稿项目占位、`placeProject`（不在布局里则插入）；松手按所在区域新建项目（无区域部分为顶层项目），把草稿换成新项目后按全量顺序 `reorderProjects`，进入项目页编辑标题。失败时恢复并提示。
- 已知：新项目在隐藏项目（稍后 / 已完成）之间的槽位按 `mergeVisibleProjectOrder` 近似，可见顺序正确。
- 测试：`SidebarProjectSection.test`（区域内落点 + 顺序 + 跳转、无区域、拖回取消、失败、桌面侧边栏不接收）、`MobileFab.test`（有接收方才可拖、有菜单可拖且点按仍开菜单、scope）。
