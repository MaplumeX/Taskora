# 01 — Row context menus inaccessible on touch

Status: done

## Problem

`TaskContextMenu` / `ProjectContextMenu`（行包裹版）/ `SubtaskRow` 的取消、删除、移动到 Project/Area、Trash 恢复等操作全部只挂在 `onContextMenu`（鼠标右键）。触屏设备没有右键，导致移动端无法删除/取消 Task、无法移动 Task、Trash 页 Task 行无法恢复。

## Fix

- 新增 `packages/ui/src/lib/useLongPress.ts`：基于 pointer 事件的长按 hook（默认 500ms、移动容差 8px，仅 touch/pen 生效，触发后抑制后续 click）。
- 三个菜单组件提取 `openMenuAt(x, y)`，右键与长按共用 virtual anchor 打开路径。
