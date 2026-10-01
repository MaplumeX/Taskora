# 05 `⇧⌘M` 快捷键打开 Move Picker（第二期）

Status: deferred
Blocked by: 03

## Problem

Things 3 可以用 `⇧⌘M` 对当前选中项打开 Move。Taskora 的 keymap（ADR 0004，`KeyboardShortcuts.tsx`）目前没有 move 动作。

## Open questions

- popover 锚点：选中行的 DOM 位置（复用 `TaskContextMenu` 的虚拟锚点），还是固定在内容区顶部。
- 多个 Selection 时批量移动，复用多选工具栏的 `patchAll` 逻辑。

## Comments
