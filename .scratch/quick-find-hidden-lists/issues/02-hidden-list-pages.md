# 02 四个隐藏列表页 + Quick Find 入口

Status: implemented — awaiting visual acceptance
Blocked by: 01

## Problem

Tomorrow、Repeating、All Projects、Logged Projects 只能从 Quick Find 进入，目前都不存在。

## Design

见 spec。

- 页面 `Tomorrow.tsx`（Upcoming feed 按明天筛出，`TimeViewFeedList`）、`Repeating.tsx`（`useFeedQuery('repeating')`，平铺）、`AllProjects.tsx`（项目列表按区域分节）、`LoggedProjects.tsx`（Logbook feed 的项目行，按了结时间分组）。
- 路由：web、desktop、mobile 三处；`page-loaders`。
- `navItems` 增加四个 NavItem；`QuickFindRow.LIST_TARGETS` 加入。
- i18n：名称、空状态。`CONTEXT.md` 增加词条。

## Acceptance

- Quick Find 能用中英文名搜到四个列表。
- 页面组件测试：Tomorrow 只收明天；All Projects 分节与顺序；Logged Projects 只有项目。
- 实机：从 Quick Find 打开各列表。

## Comments

### 2026-10-10 — 实现

- `navItems.ts`：`tomorrowNav`、`repeatingNav`、`allProjectsNav`、`loggedProjectsNav`，与 `deadlinesNav` 一起组成 `hiddenListNavs`；`LIST_TARGETS`（Quick Find 与 ⇧⌘O 前往面板共用）与 `PageHeading` 都改读它。
- Deadlines 页的主体抽成 `components/feed/FlatFeedPage.tsx`，Deadlines / Repeating 两页只传 view、标题与空状态。
- Tomorrow：从 `useFeedQuery('upcoming')` 按 `toDateKey(scheduledDate) === 明天` 筛出，交给 `TimeViewFeedList`（`showScheduledBadge={false}`）。
- All Projects：`allProjectSections(projects, areas)` 纯函数分节，区域标题复用 `AreaGroupHeaderRow`，行用 `ProjectFeedRow`。
- Logged Projects：Logbook feed 的项目行 + `groupLogbookItems`。
- 路由：web、desktop、mobile；`page-loaders`。i18n 中英文。
- 测试：`pages/HiddenLists.test.tsx`（Tomorrow 只收明天、All Projects 分节、Logged Projects 只有项目）；Quick Find 中英文名可搜到四个列表。`NavigationPopover` 测试的 `rep` 改为 `repo`（Repeating 也命中 `rep`）。
- 未做：实机目视验收。
