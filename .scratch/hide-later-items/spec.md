# Feature: Hide Later Items（隐藏稍后项）

Status: implemented

## Problem Statement

项目页和区域页里，Someday 任务、未来日期任务和可着手的任务混在一起。项目一长，暂时做不了的条目就占满视线；区域页更乱：稍后项目已经沉到底部的「计划」/「某天」小节，但区域直属的稍后任务仍混在「任务」段里。Move 选择器同样列出所有稍后项目，没法只看眼下能用的。

## Solution

参照 Things 3 的「Show N Later Items / Hide Later Items」：

- **Later Item（稍后项）**：Someday 或计划日期晚于今天的条目（定义见 CONTEXT.md）。
- **列表底部一个按钮**切换显示：显示时为「隐藏稍后项」，隐藏时为「显示 N 个稍后项」；列表没有稍后项时按钮不出现。**没有菜单项**，另有快捷键 ⇧⌘E。
- **默认显示**。状态按列表记住、持久化、跨端同步。
- **项目页**：稍后任务留在原位（原 Heading、原顺序），隐藏只是把它们从列表里去掉。
- **区域页**：区域直属的稍后任务从「任务」段移到页面最下方的「计划」/「某天」小节，与稍后项目混排；隐藏时两个小节整块去掉。
- **Move 选择器**：一个开关，隐藏稍后项目。Quick Find 不设这个开关（2026-10-12 用户确认）。

## User Stories

1. As a Taskora user, I want a「隐藏稍后项」button at the bottom of a project page when it has later tasks, so that I can focus on what I can do now.
2. As a Taskora user, I want hidden later tasks to leave no gaps or reordering, and the button to become「显示 N 个稍后项」, so that I know how much is hidden and can bring it back in one click.
3. As a Taskora user, I want headings to stay even when all their tasks are hidden, so that the project's structure doesn't jump around.
4. As a Taskora user, I want an area's own Someday / future-dated tasks shown together with its later projects under「计划」/「某天」at the bottom of the area page, so that everything not actionable yet sits in one place.
5. As a Taskora user, I want the「计划」section sorted by date and「某天」at the end, so that I can see what wakes up first.
6. As a Taskora user, I want the area page's button to hide both sections at once, so that the area shows only active projects and tasks.
7. As a Taskora user, I want each project / area to remember its own setting and sync across my devices, so that I set it once.
8. As a Taskora user, I want lists to show later items by default, so that nothing is hidden before I choose to hide it.
9. As a keyboard user, I want ⇧⌘E (Ctrl+Shift+E / Web Alt+Shift+E) to toggle the current list, and to be able to rebind it, so that I don't need the mouse.
10. As a Taskora user, I want the Move picker to have the same toggle, remembered across sessions, so that I can move among active places only.
11. As a Taskora user, I want opening a hidden item from Quick Find to switch its list back to showing later items, so that I land on what I searched for.
12. As a Taskora user, I want a task I'm editing to stay visible after I set it to Someday in a list that hides later items, until I close it, so that it doesn't vanish under my cursor (Expanded Linger).
13. As a phone user, I want the same button on project / area pages, so that both form factors match.

## Implementation Decisions

### 判定

- 在 `@taskora/shared` 新增 `isLaterTask(task, todayKey, legacyTimeZone)`，与 `laterProjectKind` 同口径（未了结、未进 Trash；Start 为 SOMEDAY，或计划日期晚于 `todayKey`），并给出 `laterTaskKind → 'scheduled' | 'someday' | null` 供区域页分节。所有页面走这两个函数（加上已有的 `laterProjectKind`），禁止手写。
- 项目页只按任务自身判定，不看项目是否为 Later Project（休眠项目里打开项目页，非稍后任务照常显示）。
- N = 当前列表在 Tag 过滤之后被隐藏的条目数。已了结（含 Unlogged Item）不算稍后项。

### 状态存储

- **项目页 / 区域页**：Project 与 Area 新增普通字段 `hideLaterItems: boolean`，默认 `false`，字段级 LWW。改动链路同 `lastReviewedOn`：Prisma schema + migration、`packages/engine/src/entities.ts` / `migrations.ts`、`packages/backend/src/sync/entity-codec.ts`、`packages/api/src/engine/mappers.ts`、shared DTO（Update / Response）。
- 切换和其他字段一样经引擎写入，会进撤销栈（ADR 0024 在写入边界统一记录，不为它开例外）。
- 引擎副本新增布尔列类型（`FieldDef.bool`，SQLite 存 0 / 1）；Hub codec 新增 `boolFields`，非布尔剔除；Prisma 列 `Boolean @default(false)`，存量行与空值即显示。
- **Move 选择器**：`UserPreferences` 新增 `hideLaterItemsInMovePicker?: boolean`，缺省 false，LWW。

### 按钮

- 共享组件 `LaterItemsToggle`：muted 次要行样式，文字「隐藏稍后项」/「显示 N 个稍后项」（i18n zh / en）。N = 0 时不渲染。
- 不是 Selection 停留点，不可拖拽、不是落点。
- 位置：项目页在任务列表最后（所有 Heading 之后）；区域页在「计划」/「某天」小节之后（隐藏时就在它们原来的位置）；Move 选择器在结果列表末尾。

### 项目页（`ProjectDetail.tsx`）

- 隐藏时从传给 `TaskListView` 的任务里滤掉稍后任务；Heading 一律保留（即使变空）。
- 拖拽排序在可见任务之间进行，落点换算到全量顺序，隐藏任务的 Position 不变（与 `mergeVisibleProjectOrder` 同思路）。
- Expanded Linger：展开中的任务被改成稍后任务时留在原位，收起后才隐藏（复用现有暂留机制）。

### 区域页（`AreaDetail.tsx`）

- 「任务」段只放直属的非稍后任务。
- 「计划」/「某天」小节改为项目与任务混排（`LaterProjectSections` 扩展为 `LaterItemSections`，Later Projects 页继续只传项目）：
  - 计划：按计划日期升序，同一天按 Position / Feed Position，与 Upcoming 一致；不可节内排序。
  - 某天：排序与拖拽同 Someday 视图（任务 Position 与项目 Feed Position 混排）。
- 隐藏时两个小节整块不渲染。键盘遍历顺序不变：活跃项目 → 任务 → 计划 → 某天。

### Move 选择器 / Quick Find

- Move 选择器：隐藏时去掉稍后项目（目前是弱化显示），当前所在位置保留。Quick Find 没有开关，照常列出全部结果。
- 从 Quick Find 打开的目标是被隐藏的条目时（所在项目 / 区域 `hideLaterItems = true` 且条目是稍后项），先把该列表的 `hideLaterItems` 写回 false，再导航定位。

### 快捷键

- keymap 新增 `toggleLaterItems`，默认 `shiftAltOnWebDefaults('E')`（⇧⌘E / Ctrl+Shift+E / Alt+Shift+E），可在快捷键设置里改（ADR 0017）。
- 作用于当前列表：项目页、区域页；Move 选择器打开时作用于该弹窗。其他页面（含 Quick Find）无操作。
- 手机端只有按钮。

## Testing Decisions

只测外部行为：

1. **判定函数**（纯单测）：Someday、明天、今天、已过、无日期、已了结、Trash；跨时区边界。
2. **同步字段**：engine 迁移、entity-codec 编解码、字段级 LWW 合并各一例；缺省值为 false。
3. **项目页**：按钮仅在有稍后任务时出现；隐藏后稍后任务不渲染、Heading 保留、计数正确；隐藏状态下拖拽不改变隐藏任务的 Position；展开中的任务改成 Someday 后暂留。
4. **区域页**：直属稍后任务进入计划 / 某天小节并与项目混排排序正确；隐藏后两节消失。
5. **Quick Find / Move**：开关隐藏对应条目；从 Quick Find 打开被隐藏条目时目标列表切回显示。
6. **快捷键**：在项目页、区域页、Quick Find 中切换对应状态。

## Out of Scope

- Later Projects 页、All Projects 等 Hidden List 的开关（Later Projects 页里全是稍后项，没有意义）。
- Tag 页、Anytime 等汇总视图（稍后任务本来就不在这些视图里）。
- 稍后任务行的视觉弱化。

## Further Notes

- 2026-10-12 与用户确认：默认显示；项目页留在原位、区域页用计划 / 某天小节；状态按列表持久化并同步；只有底部按钮与快捷键，没有菜单项；展开后计划按日期排、某天在最后。
- 调研来源：[An In-Depth Look at Today, Upcoming, Anytime, and Someday](https://culturedcode.com/things/support/articles/4001304/)（"Inside of projects, inactive to-dos take a back seat beneath their active counterparts"）、[Mac Release Notes](https://culturedcode.com/things/support/articles/1100684/)（3.15.8 Later 小节需要时自动展开；3.21.14 Hide Later Items 按钮）、[iPhone Release Notes](https://culturedcode.com/things/support/articles/2409121/)（3.15.5 Quick Find / Move 的 Show/Hide Later Items 开关；3.15.18 Quick Find 定位时自动展开）、[Keyboard Shortcuts for Mac](https://culturedcode.com/things/support/articles/2785159/)（⇧⌘E）。
