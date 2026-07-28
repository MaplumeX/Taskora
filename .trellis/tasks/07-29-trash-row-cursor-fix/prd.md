# PRD — Fix trash row hover cursor

## 背景

普通任务行（`TaskItem`）的行内容容器在 `onRowClick` 存在时带 `role="button"`，浏览器自动渲染 `cursor: pointer`，hover 时显示手型光标。废纸篓行（`Trash.tsx`）没有 `onRowClick`，行内容容器既无 `role="button"` 也无 `cursor-pointer` class，hover 时是默认箭头，与普通行不一致。

## 目标

让废纸篓行 hover 时显示手型光标，与普通任务行一致。

## 需求

### R1 给废纸篓行内容容器加 cursor-pointer
- 在 `Trash.tsx` 行内容容器（`flex h-12 items-center gap-3 px-2` 这个 div）上加 `cursor-pointer` className。
- 不加 `role="button"` / `onRowClick`（废纸篓行没有展开/点击交互语义，只对齐视觉光标）。

### R2 不引入点击行为
- 废纸篓行保持不可点击（无展开、无导航）。仅光标表现与普通行一致。

## 验收标准

- AC1：hover 废纸篓行时鼠标光标为手型（pointer），与普通任务行一致。
- AC2：点击废纸篓行不触发任何行为（无展开、无导航）。
- AC3：右键菜单仍正常工作。
- AC4：普通任务行无回归。

## 非目标

- 不给废纸篓行加展开/编辑能力。
- 不改 `TaskContextMenu` 组件。