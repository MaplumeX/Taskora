# 04 ⇧⌘T 快捷键打开 Tag Picker

Status: implemented — awaiting visual acceptance
Blocked by: 02, 03

## Problem

keymap（ADR 0004）里没有 Tag 动作，打标必须用鼠标展开或右键。

## Design

见 spec 第 3 节。

- `keymap.ts`：新增 `{ type: 'tags' }`。mac 用 ⇧⌘T，windows 用 Ctrl+Shift+T，web 用 Alt+Shift+T。在 `SHORTCUT_LABELS` 加入展示文案。
- `KeyboardShortcuts.tsx`：Selection 非空时打开 Tag Picker。popover 锚点用选中行（复用 `TaskContextMenu` 的虚拟锚点）。如果 move-picker 的 issue 05（⇧⌘M）先落地，就和它共用同一套锚点逻辑。
- Selection 为单条 Task、Project 或 Area 时打开单选 Picker；为多条时打开三态 Picker。
- 更新 `docs/keyboard-shortcuts.md`。

## Acceptance

- 在任意列表中选中一行，按快捷键弹出 Tag Picker，搜索框已聚焦；`Esc` 关闭后 Selection 不变。
- 多选后按快捷键得到三态 Picker。
- keymap 单测覆盖三个平台的键位。

## Comments

### 2026-10-01 — 实现

- `keymap.ts` 新增 `tags` 动作和 hint 文案；Web 端 Ctrl+Shift+T 不拦截。
- `KeyboardTagPicker`：锚点是最后一个选中行的 `[data-selection-row]` 元素（虚拟锚点，每次取实时位置）；没有走 move-picker issue 05，那条还没做。关闭后焦点还给该行，Selection 不变；切换页面时一并关闭。
- 作用对象：Selection 中登记了 `tagIds` 的 task / project 行。为此 Project 行（Area 页、稍后项目区、Grouped View 项目行、Upcoming）也登记了 `tagIds`；Grouped View 的项目组头不登记，所以不会被当成「没有 Tag」整组覆盖。
- 单选和多选共用 `MultiTagsField`（单个时三态退化为勾选），Task 写 `useUpdateTask`、Project 写 `useUpdateProject`。
- Area 页的 Area 本身不在 Selection 里，不支持快捷键打标，仍走右上角菜单。
- 测试：keymap 3 个、接缝测试 3 个；`docs/keyboard-shortcuts.md` 已更新。
