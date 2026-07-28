# PRD — Fix trash row structure to match TaskItem

## 背景

上一任务（`07-29-trash-context-menu`）给废纸篓行加右键菜单时，直接把 `<TaskContextMenu>` 包在行内容外层。`TaskContextMenu` 内部渲染一个 `flex flex-col` 的容器 div 作为 popover 锚点，导致废纸篓行的布局结构与普通任务行（`TaskItem`）不一致：

- 普通行：根 `data-task-item` div → `TaskContextMenu` 的 `flex flex-col` 容器 → 内层 `flex h-10 items-center` 行头。
- 废纸篓行：`TaskContextMenu` 的 `flex flex-col` 容器直接成为行容器，缺少与 `TaskItem` 一致的外层结构，导致对齐/指针感受与正常行不一致。

## 目标

让废纸篓行的 DOM 结构与 `TaskItem` 的折叠行结构一致，消除布局/指针差异。

## 需求

### R1 套一层与 TaskItem 一致的外层结构
- 废纸篓每行外层包一个 `<div data-task-item>`（或等价的、不强制 `flex-col` 的容器），再在其内放 `<TaskContextMenu variant="trash">`，`TaskContextMenu` 内部仍是行内容。
- 结构对齐 `TaskItem` 折叠态：外层根 div → `TaskContextMenu`（`flex flex-col` + onContextMenu）→ 内层行内容 `flex h-12 items-center gap-3 px-2`。

### R2 保持行高与样式
- 废纸篓行仍为 `h-12`（与改动前一致，不改行高，只改结构嵌套）。
- 保持 `line-through`、禁用 checkbox、`TaskDateBadge`、`text-muted-foreground`。

### R3 不改 TaskContextMenu 组件本身
- 本任务只调整 `Trash.tsx` 的调用结构，不动 `TaskContextMenu.tsx`。

## 验收标准

- AC1：废纸篓行的鼠标指针/对齐感受与普通任务行一致（hover、cursor、行内垂直对齐）。
- AC2：右键菜单仍正常弹出并定位到鼠标坐标，恢复项仍生效。
- AC3：行高仍为 h-12，视觉样式（删除线、禁用 checkbox、日期 badge）无变化。
- AC4：普通任务行无回归。

## 非目标

- 不改行高（h-12 不改成 h-10）。
- 不改 `TaskContextMenu` 组件。
- 不引入展开/编辑能力。