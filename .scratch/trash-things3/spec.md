# Trash 行对齐 Things 3：普通行样式 + 「放回」

Status: implemented — awaiting device acceptance

Issues: `issues/01-put-back-semantics.md`、`issues/02-trash-rows-reuse-feed-row.md`、`issues/03-trash-multi-select.md`

对齐 Things 3：Trash 是普通列表，条目长得和其他视图一样，状态照常显示、可照常编辑；Trash 独有的只有右键菜单「放回」（恢复）与顶部「清空废纸篓」。

## Problem Statement

`pages/Trash.tsx` 自带 `TrashTaskRow` / `TrashProjectRow`，与其他视图（`FeedItemRow` → `TaskItem` / `ProjectFeedRow`）分叉：

- 样式：整行 `text-muted-foreground` + 标题 `line-through`；复选框恒为 `checked={false} disabled`，看不出原本是完成 / 取消 / 未完成；只显示计划日期徽标，无截止日期、标签、备注图标、子任务进度、所属项目 / 区域。
- 项目行用 `Folder` 图标而非进度饼图，行内常驻「恢复」文字按钮。
- 任务行点击只切换 Selection，不能展开详情编辑。
- 维护成本：两套行组件，`TaskItem` 后续改动（Things 3 视觉语言、时间显示等）不会自动惠及 Trash。

## Solution

- Trash 页改用 `FeedItemRow` 渲染任务行与项目行（参考 `Logbook.tsx` 的接法：`useTaskRowSelection` + `selectionStateOf`、`projectTitle` / `areaTitle`），删除 `TrashTaskRow` / `TrashProjectRow`。
- 去掉删除线与整行灰化；复选框按真实状态显示（完成 / 取消 / 未完成），可照常勾选。
- 任务行可展开详情编辑（与其他视图一致）。
- 菜单变体透传：`TaskItem` → `TaskContextMenu`、`ProjectFeedRow` → `ProjectContextMenu` 需能接收 `variant="trash"`，菜单末项为「放回」（调用现有 restore，文案用新键 `putBack`），隐藏「转为项目」。
- 项目行去掉行内「恢复」按钮，恢复统一走菜单「放回」；点击进入项目详情不变。
- 保留：顶部「清空废纸篓」+ 确认框；Trash 页 ⌫ = 放回（`keymap.ts`）；排序沿用现有 feed 排序（Trash 不可拖动排序）。

## Decisions

- **触屏：接入左滑多选。** Trash 行与其他视图一样左滑进入 Multi-Select Mode；工具栏在 Trash 下「删除」换成「放回」。Trash 无排序，长按不再开菜单（放回改由左滑工具栏 / 右键菜单承担）。同步更新 `CONTEXT.md` Multi-Select Mode 条目中「Trash 行不可拖动，仍以长按打开菜单」。
- **在 Trash 中编辑：改状态不放回，其他放回。** 完成 / 取消 / 撤销完成 / 撤销取消只改状态，任务留在 Trash；改计划日期、截止日期、移动、标签、重复规则等其他编辑隐式放回（同一次写入里清 `trashedAt`）；改标题 / 备注 / 子任务不放回。逻辑落在 engine 写入层（`planTaskUpdate` 一侧），REST 后端同步对齐，使菜单、详情、多选工具栏、Agent 工具行为一致。
- **放回保留了结状态。** 放回只清 `trashedAt`：已完成 / 已取消的任务放回后回到 Logbook，未完成的回到原视图。`taskRestorePatch` 去掉 `status: ACTIVE` / `settledAt: null`，与 `planProjectRestore` 的级联恢复一致。
- **Trash 里的项目同样隐式放回。** 改项目的计划日期、截止日期、标签、移动区域等编辑放回该项目，效果等同「放回」（级联放回随项目同一时刻进 Trash 的任务，`planProjectRestore`）；改状态（完成 / 取消 / 重开）与改标题 / 备注不放回，与任务规则一致。
- **提醒不随放回恢复。** 进 Trash 时清掉的 `reminderTime` 放回后保持为空，需要时重新设置（避免放回即弹过期提醒）。
- **文案：新增 `putBack` 键**（「放回」/ Put Back），只用于 Trash 的任务 / 项目菜单与多选工具栏；`common:restore` 保持不动。

## Out of Scope

- 软删除本身（`trashedAt`）、`planEmptyTrash`、Delete Request 不变（隐式放回与放回状态语义见上）。
- Trash 内分组 / 按删除时间排序。
