# Unify subtask row styling with rest of app

## Goal

让展开任务行里的子任务行（`SubtaskRow`，定义于 `packages/frontend/src/components/task/TaskRowExpanded.tsx`）在视觉和交互上与应用其余部分一致。当前子任务行使用原生 HTML 元素，与主任务行和工具栏风格脱节。

## Background / Confirmed Facts

通过代码探查确认的事实：

- `SubtaskRow` 组件（`TaskRowExpanded.tsx:307-396`）当前使用：
  - 原生 `<input type="checkbox">` —— 方形、浏览器默认样式，无 hover/active 反馈
  - 原生 `<input>`（编辑态）+ `ring-1 ring-ring` —— 与标题编辑用的 shadcn `Input` 不一致
  - 原生 `<button>`（删除）—— 与工具栏图标按钮（shadcn `Button variant="ghost" size="icon"`）不一致
- 主任务行（`TaskItem.tsx`）对照：
  - 勾选用 `TaskCheckbox`（`TaskCheckbox.tsx`）—— 圆形、`Check` 图标、`checkbox-pop` 动画、`active:scale-90`
  - 标题编辑用 shadcn `Input`（`TaskItem.tsx` 展开态）
  - 图标按钮用 shadcn `Button variant="ghost" size="icon"`（见 `TaskRowExpanded.tsx` 的 `IconPopover` 工具栏）
- 已有依赖可直接复用：`Button`、`Input` 已在 `TaskRowExpanded.tsx` 顶部 import；`TaskCheckbox` 是同目录组件；`Trash2` 已从 lucide-react import。

## Requirements

1. **子任务勾选框**：替换原生 `<input type="checkbox">`，改用 `TaskCheckbox` 组件（圆形、Check 图标、pop 动画），与主任务行复选框一致。
2. **子任务标题编辑输入**：替换原生 `<input>`，改用 shadcn `Input`，样式与 `TaskItem` 展开态标题输入对齐（`border-0 px-0 shadow-none focus-visible:ring-0`，完成态 `line-through`）。
3. **子任务删除按钮**：替换原生 `<button>`，改用 shadcn `Button variant="ghost" size="icon"`，尺寸/颜色与工具栏图标按钮一致（`h-8 w-8`、`text-muted-foreground hover:text-destructive`）。
4. **保留全部现有交互行为**：单击切换完成、单击标题进入编辑、Enter 提交、Escape 取消、删除调用 `deleteSubtask`；所有 `stopPropagation` 行为保持不变。
5. **可访问性**：勾选框与删除按钮需保留可访问的 `aria-label`（`TaskCheckbox` 已内置 `aria-label`；删除按钮需补上）。

## Acceptance Criteria

- [ ] 子任务行的勾选框视觉与主任务行复选框一致（圆形 + Check 图标 + pop 动画）
- [ ] 子任务行编辑态输入使用 shadcn `Input`，视觉与主任务行标题编辑一致
- [ ] 子任务行删除按钮使用 shadcn ghost icon button，尺寸 `h-8 w-8`
- [ ] 完成/取消完成、编辑提交/取消、删除等交互行为均保持原样
- [ ] 现有 `TaskRowExpanded.test.tsx` 测试全部通过
- [ ] 无新增 lint / type 错误

## Out of Scope

- 不改动 `SubtaskRow` 的数据流 / mutation 逻辑
- 不改动子任务区块的布局（header / 列表 / 新建输入框位置）
- 不调整 `TaskRowExpanded` 工具栏区域的样式
- 不引入新依赖

## Technical Notes

- 勾选框尺寸适配：`TaskCheckbox` 固定 `h-[18px] w-[18px]`，子任务行行高较小（`text-sm`、`gap-2`），可能需要微调容器 `items-center` 间距，但不改 `TaskCheckbox` 组件本身。
- shadcn `Input` 默认 `h-9`，子任务行需 `h-8 text-sm`（沿用现有新建子任务 `Input` 的 `className="mt-1 h-8 text-sm"`）。
- 删除按钮 `size="icon"` 默认即 `h-8 w-8`，`variant="ghost"` 即可，`text-muted-foreground hover:text-destructive` 通过 `className` 覆盖。

## Risks / Deferred

- `TaskCheckbox` 的 `checkbox-pop` 动画已在 `packages/frontend/src/index.css:126-129` 定义为全局 CSS，子任务勾选框会自动获得 pop 动画，无需额外处理。