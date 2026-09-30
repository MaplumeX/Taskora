# Feature: Later Projects（稍后项目）

Status: implemented

## Problem Statement

项目可以设为 Someday 或设一个未来的计划日期，但目前这只影响项目自己出现在哪个 Bucket 视图：侧边栏仍把它和活跃项目并列，区域页把它和活跃项目平铺在同一个「项目」列表里，项目内的任务照样出现在 Anytime 等视图。用户把一个项目「放到以后」的意图没有被尊重，侧边栏和各视图被暂时不做的东西占满。

## Solution

参照 Things 3：把 Someday 项目和未来日期项目统称为 **Later Project（稍后项目）**，视为「休眠」——

- **侧边栏**不显示稍后项目。
  - 无区域的稍后项目收成一个「N 个稍后项目」条目，只在 N ≥ 1 时出现，固定在无区域项目列表的最后一位，不可拖动、不参与排序；点击进入 **Later Projects 页**。
  - 有区域的稍后项目在侧边栏完全不显示（也不计入上面的 N），在**区域页**里查看。
- **Later Projects 页**：标题「稍后项目」，列出无区域的稍后项目，按状态分在「计划」「Someday」两个小节标题下。
- **区域页**：活跃项目、任务之后，页面最下方是该区域的稍后项目，同样分在「计划」「Someday」两个小节标题下。
- **任务跟随父项目休眠**：稍后项目内的任务不出现在 Anytime / Someday 等汇总视图里；进入项目详情页一切照常。
- 全部是**推导状态，不做级联写入**：项目移回活跃，任务原样回来。

## User Stories

1. As a Taskora user, I want Someday projects and future-dated projects hidden from the sidebar, so that the sidebar only shows projects I can work on now.
2. As a Taskora user, I want a「N 个稍后项目」entry at the end of the no-area project list when I have any no-area later projects, so that I can still reach them in one click.
3. As a Taskora user, I want that entry to disappear when there are no no-area later projects, so that it never shows「0 个稍后项目」.
4. As a Taskora user, I want that entry to stay pinned at the end and not be draggable, and I cannot drop a project after it, so that it never gets mixed into my manual ordering.
5. As a Taskora user, I want the Later Projects page to split projects into「计划」and「Someday」sections, so that I can see which projects will wake up by themselves and which are waiting on me.
6. As a Taskora user, I want an area's later projects hidden from the sidebar but shown on the area page under「计划」/「Someday」sections below the active projects, so that each area's full picture stays in one place.
7. As a Taskora user, I want a future-dated project to automatically return to the sidebar (and leave the later sections) once its date arrives, in my account time zone, so that I don't have to reactivate it by hand.
8. As a Taskora user, I want tasks inside a later project hidden from Anytime and not listed individually in Someday, so that a hibernating project doesn't leak its tasks into my action lists.
9. As a Taskora user, I want those tasks to come back unchanged when the project becomes active again, so that pausing a project is lossless.
10. As a Taskora user, I want the project detail page of a later project to show its tasks normally, so that I can still plan inside it.
11. As a Taskora user, I want reordering visible projects in the sidebar not to scramble the relative order of hidden later projects, so that when they wake up they come back where they were.
12. As a Taskora user, I want dragging a later project onto another area (e.g. from the Later Projects page to an area row in the sidebar) to change only its area, not its Someday/date state, so that moving it doesn't accidentally wake it.
13. As a phone user, I want the same behavior in the mobile home list (which reuses the sidebar project section), so that both form factors match.

## Implementation Decisions

### Domain model（CONTEXT.md 已更新）

- **Later Project（稍后项目）**：未了结、未进回收站，且 `scheduledType = SOMEDAY`，或 `scheduledType = DATE` 并且计划日期晚于账号时区的今天。计划日期已过或为今天的项目是活跃项目（与 Scheduled Date「日期已过按今天对待」一致）。
- 按状态细分：`scheduled`（未来日期，对应「计划」小节）、`someday`（对应「Someday」小节）。

### 单一判定函数

- 新增纯函数（放在前后端都能用的位置，例如 `@taskora/shared`）：`laterProjectKind(project, todayKey) → 'scheduled' | 'someday' | null`，`isLaterProject = kind !== null`。`todayKey` 由调用方按账号时区给出（沿用 `packages/api/src/utils/date.ts` 的 `todayDateKey` / `toDateKey` 口径）。
- 侧边栏、Later Projects 页、区域页、任务视图过滤全部走这一个函数，禁止各自手写判断。
- 日期跨天时依赖现有的 today key 刷新机制（Today 视图已有），不新增定时器。

### 侧边栏（`Sidebar.tsx` / `SidebarProjectSection.tsx` / `sidebarProjectLayout.ts`，Home 页复用）

- 渲染层过滤掉稍后项目；`normalizeSidebarProjectLayout` 的 containers 只包含可见项目。
- 「N 个稍后项目」条目：N = 无区域的稍后项目数。渲染在 standalone 容器的 `SortableContext` **之外**、紧接其后；不是 sortable item，也不在 containers 里，所以拖拽落点天然到不了它后面。样式为 muted 次要行（不带项目进度环）。点击导航到 `/later-projects`；在该路由时显示选中态。
- **排序持久化保留隐藏项**：`ProjectsService.reorder` 按传入列表的下标重写 `sortOrder` / `position`，只传可见项目会让隐藏项目与之撞号。`serializeProjectOrder` 改为输出**全量**项目顺序：以拖拽前的全量顺序为底，把可见项目按新顺序依次填回可见项原来占的槽位，隐藏项目（稍后项目以及当前已被过滤的已完成项目）保持原槽位不动。纯函数 + 单测。
- 跨容器拖到 Area 行时只改 `areaId`，不动 `scheduledType` / `scheduledDate`（现有 `updateProject` 调用本来就只传 `areaId`，加测试锁住）。

### Later Projects 页（新路由 `/later-projects`）

- 三处路由都要加：`packages/frontend/src/router.tsx`、`packages/desktop/src/MainApp.tsx`、`packages/mobile/src/MainApp.tsx`。页面放 `packages/ui/src/pages/LaterProjects.tsx`。
- 标题「稍后项目」（i18n zh / en）。内容：无区域的稍后项目，经共享组件 `LaterProjectSections` 分成「计划」「Someday」两节；空的小节不显示标题；两节都空时显示空态文案。
- 排序：「计划」按计划日期升序（同日按 sortOrder）；「Someday」按 sortOrder。**两节都不支持拖拽排序**。
- 项目行复用 `ProjectFeedRow`（与 Today/Upcoming 等汇总视图一致；`ProjectItem` 仅服务侧边栏），「计划」小节的行显示日期 chip；行点击进入项目详情、键盘 Selection（↑/↓）可遍历（`useSelectionScope`，kind: 'project'）。

### 区域页（`AreaDetail.tsx`）

- 现在的「项目」列表只放该区域的活跃项目，保留现有拖拽排序（排序持久化同样要用上面的全量序列化，避免撞号）。活跃项目行同样复用 `ProjectFeedRow`，外层保留 dnd-kit 拖拽包装。
- 页面最下方（活跃项目、任务之后）渲染 `LaterProjectSections`（该区域的稍后项目），规则与 Later Projects 页一致。键盘遍历顺序同页面：活跃项目 → 任务 → 计划 → Someday（`useSelectionScope` 新增显式 rank）。
- 区域页的「任务」段本次不改。

### 任务跟随父项目休眠

- 任务的「有效活跃」= 任务本身满足视图条件，并且（无项目，或所属项目不是稍后项目）。**不改写任务字段**。
- 生效视图：**Anytime**、**Someday**（稍后项目内的 Someday 任务不再逐条出现；项目本身作为项目行出现在 Someday 视图，这是现有行为）。
- Today / Upcoming 中带明确日期的任务**照常显示**（已对照 Things 3 实测确认：稍后项目内有日期的任务到期仍进 Today / Upcoming）。
- 需要同时改：
  - 后端 `packages/backend/src/tasks/views.ts` 的 `buildTaskViewWhere`（anytime / someday 加上父项目条件；「未来日期」条件依赖账号时区，与 today/upcoming 一样由调用方补谓词）。
  - 本地引擎 `packages/api/src/engine/task-backend.engine.ts` 的 `taskMatchesView`（需要能查到父项目行）。
  - 事件匹配 `packages/api/src/events/task-query-match.ts`：**项目的 `scheduledType` / `scheduledDate` / `status` 变化时，必须让其下任务所在的视图查询失效或重新匹配**，这是最容易漏的地方。
- Grouped View（`.scratch/grouped-time-views`）无需改动：任务被过滤掉后，组头按「≥1 个可见任务」规则自然不出现。

## Testing Decisions

只测外部行为，沿用现有 seam：

1. **判定函数**（纯单测）：SOMEDAY → someday；DATE 明天 → scheduled；DATE 今天 / 已过 → null；NONE → null；已完成 / 回收站 → null；跨时区边界。
2. **侧边栏布局纯函数**（`sidebarProjectLayout.test.ts`）：过滤稍后项目；全量序列化保持隐藏项槽位不变；N 的计数只算无区域稍后项目。
3. **组件测试**（`SidebarProjectSection.test.tsx`）：入口行 N ≥ 1 才出现、位于无区域列表末尾、不可拖、点击导航；拖项目到 Area 只发 `areaId`。
4. **Later Projects 页 / 区域页**：分节、空节隐藏、计划按日期升序、无拖拽手柄。
5. **任务视图**：后端 views where、本地引擎 `taskMatchesView` 各一组用例（稍后项目内任务被排除、项目转活跃后回来）；事件匹配在项目变更后使相关任务查询失效。

## Out of Scope

- 区域页「任务」段对 Someday / 未来日期任务的分组。
- 稍后项目的视觉灰淡化（项目行样式）——可作为后续小改。
- Things 3 的「Hide Later Items」开关。
- 侧边栏 / Later Projects 页的 Logbook 类「已完成项目」入口。

## Further Notes

- 已确认（2026-09-28，实测 Things 3）：稍后项目内带明确计划日期的任务照常进入 Today / Upcoming，父项目休眠只影响 Anytime / Someday。
- 调研来源：[An In-Depth Look at Today, Upcoming, Anytime, and Someday](https://culturedcode.com/things/support/articles/4001304/)（"Inactive projects disappear from the sidebar"；休眠项目 "disappear from the sidebar (Mac/iPad) and the main lists view (iPhone)"；Someday 中 "neither to-dos nor projects will show up in Anytime or Upcoming"）、[GTD 论坛](https://forum.gettingthingsdone.com/threads/your-things-3-projects-setup.17174/page-2)（"2 later projects" 入口）、[Mac Release Notes](https://culturedcode.com/things/support/articles/1100684/)（3.15.6：拖到侧边栏 Area 不应重新激活休眠项目）。入口位置、小节划分由用户对照 Things 3 实物确认。
