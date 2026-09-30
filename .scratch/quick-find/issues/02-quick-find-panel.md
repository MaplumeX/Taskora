# 02 Quick Find 面板：分组结果、导航目标、键盘操作、Reveal

Status: implemented — awaiting visual acceptance
Blocked by: 01

## Problem

`SearchModal` 只能搜任务、结果原地展开、没有键盘选择。

## Design

见 spec 第 1、3、4 节。要点：

- 新组件 `packages/ui/src/components/search/QuickFind.tsx` 替换 `SearchModal`，挂载点与 `searchOpen` 不变。
- 导航目标：内置列表（当前语言名 + 英文别名）、Area、未了结 Project（含 Later Project）、Tag，从现有本地查询计算，纯函数 `matchNavTargets` 便于测试。
- 任务行：专用轻量行（状态图标、标题、所属 Project / Area），Subtask 命中在下方逐行列出；命中片段高亮。
- 键盘：面板内维护跨组高亮索引；`↑`/`↓`/`Enter`/`Esc`。确认输入框聚焦时全局 keymap 不派发 `moveUp`/`moveDown`。
- 打开任务：`useRevealTask`。
- i18n：`search.json` 增补组标题、空输入提示等（zh / en）；删除不再使用的 `includeCompleted`、`title`。

## Acceptance

- 输入「today」「今天」都能命中 Today 并回车跳转；Area / Project / Tag 同理。
- 任务回车后面板关闭，跳到 `revealRouteFor` 给出的视图，任务展开并滚入视野。
- Subtask 命中的父任务下方显示命中的 Subtask 标题。
- 键盘高亮可跨组连续移动，输入变化时回到第一项。

## Comments

### 2026-09-30 — 实现

- 面板：`QuickFind` 替换了 `SearchModal`（旧组件已删除，`@taskora/ui` 改为导出 `QuickFind`），三个挂载点（`ContentBottomBar`、`MobileTopBar`、`Home`）以及 `searchOpen` 保持不变。
  - 形态：弹窗贴近顶部（桌面 12dvh，移动端距顶 8px），标题只保留给读屏器（sr-only），不显示关闭按钮（Esc 或点遮罩关闭）。
- 纯函数：`quickFindResults.ts`，包含 `buildQuickFindGroups`、`quickFindRoute`、`highlightParts`。spec 里的 `matchNavTargets` 合并进了 `buildQuickFindGroups`。
  - 区域与项目的顺序复用 `groupedFeedLayout.flatParentOrder`（改为导出），与侧边栏的全局视觉顺序一致。
  - 内置列表：主导航、稍后项目、废纸篓、标签页，匹配当前语言名称和英文名（`i18n.getFixedT('en')`）。
- 同步：导航目标和任务结果都按防抖后的 `searchedQuery` 推导，两组同时更新。新一轮任务结果到达前保留上一轮，避免任务组闪烁。
- 行：任务行用静态状态图形 `TaskStatusGlyph`，外观同 TaskCheckbox；项目行用从 `ProjectProgressRing` 抽出的 `ProjectProgressPie`。两者都不嵌套按钮，避免在 option 里放可交互元素。
  - 任务行尾显示所属 Project 或 Area；命中的 Subtask 在任务标题下方逐行列出；所有命中片段用 `<mark>` 高亮。
- 键盘：输入框是 `role="combobox"`，用 `aria-activedescendant` 指向当前高亮项。`↑`/`↓` 跨组循环移动，`Enter` 打开，IME 组合输入期间忽略按键。全局 keymap 在输入框聚焦和 Dialog 打开时本就让路，无需改动。
- 打开：先关闭面板，导航目标直接 `navigate`，任务走 `useRevealTask`。
- i18n：`search.json` 重写，删除 `includeCompleted`、`placeholder`、`searching`、`groupProjects`、`groupAreas`，新增 `emptyHint`、`groupLists`、`groupPlaces`，`title` 改为「快速查找」。底栏和顶栏按钮仍沿用 `task:searchTasks`（「搜索任务」）。
- 测试：纯函数 9 个，组件 9 个（分组、Enter 跳转、中英文名称、跨组键盘与循环、输入变化后高亮复位、Subtask 命中与高亮、点击跳转、无结果）。
- 验证：全部包 typecheck 通过，eslint 通过。ui 367、desktop 51、mobile 72、frontend 16 个测试通过。
- 未做：没有在真实 App 里目视验收（web 端需要后端和数据库，本机唯一的 Postgres 属于另一个 worktree）。
