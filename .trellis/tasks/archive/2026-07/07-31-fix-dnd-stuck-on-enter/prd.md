# fix: 任务展开态输入框按 Enter 卡在拖拽态

## Goal

修复在任务展开态的子任务/标题/备注输入框里按 Enter 提交后，任务行卡在拖拽态（`isDragging=true`、`opacity:0.45` 半透明不恢复）的问题。

## Background

`SortableTask`（`ProjectTaskLayout.tsx`）/ `SortableTaskItem`（`TaskList.tsx`）把 dnd-kit 的 `{...attributes} {...listeners}` 铺在整行外层 div 上，其中包含展开态的 `TaskRowExpanded` 里的全部可编辑控件。

dnd-kit 的 `KeyboardSensor` 默认把 **Enter / Space** 当作"开始拖拽"按键。当用户在「添加子任务」输入框按 Enter 提交时：
1. 输入框自身 `onKeyDown` 先执行 → 子任务被创建 ✅
2. 同一个 keydown 冒泡到外层 div 的 `onKeyDown`（listeners）→ KeyboardSensor 启动拖拽 → `isDragging=true` → 行半透明
3. 单任务时 `SortableContext` 无可换位落点，键盘拖拽无法自然结束，卡在拖拽态。

现有代码只对 `onClick` 做了 `stopPropagation`，没处理 `onKeyDown`/`onPointerDown`，这就是漏洞所在。

## Requirements

- **R1**：在 `TaskRowExpanded` 内所有可编辑控件（子任务 Input、标题 Input、备注 Textarea）的 keydown 事件停止冒泡，阻止 Enter/Space 被 dnd-kit KeyboardSensor 误判为"开始拖拽"。
- **R2**：同样修复 `TaskList.tsx` 中 `SortableTaskItem` 路径下的展开态输入（与 `ProjectTaskLayout.tsx` 的 `SortableTask` 对称处理），避免只修一处而另一处仍 reproduce。
- **R3**：不改变现有 `onClick` 的 `stopPropagation` 语义（防止误折叠），保留现有交互行为。
- **R4**：不引入结构性拖拽手柄改动（本次不做方案 B），保持整行可拖拽但输入控件不会触发键盘拖拽。
- **R5**：修复对 pointer 拖拽无影响（PointerSensor 用 `activationConstraint.distance:5`，与键盘事件互不干涉）。

## Acceptance Criteria

- [ ] 在项目详情页（`ProjectTaskLayout`）展开单个任务 → 在子任务输入框输入文字并按 Enter 提交后，任务行立即恢复到非拖拽态（`opacity` 不为 `0.45`，新增的子任务出现在列表中）。
- [ ] 在通用任务列表（`TaskList`，如 Today / Inbox）展开任务 → 标题、备注、子任务输入框按 Enter 均不卡在拖拽态。
- [ ] 展开态标题输入框按 Escape 仍能正常折叠（保留原有 Escape 行为）。
- [ ] 键盘拖拽（聚焦整行后按 Space/Enter 移动任务）在不涉及内部输入框时仍可用（或不回归现有行为）。
- [ ] 现有 `ProjectTaskLayout.test.tsx` / `TaskCheckbox.test.tsx` / `ProjectHeadingRow.test.tsx` 全部通过。
- [ ] 新增回归测试：覆盖"展开态子任务输入框按 Enter 后行不卡在 isDragging"。

## Scope / Out of Scope

**In scope**
- `packages/frontend/src/components/task/TaskRowExpanded.tsx`（源端 stopPropagation）
- 必要时对 `TaskItem.tsx` 展开态标题 Input 同步处理
- 回归测试

**Out of scope**
- 方案 B（引入专用拖拽手柄、重构 listeners 结构）
- `Sidebar`/`AreaDetail`/`FeedListView` 的拖拽（场景不同，无展开态输入框）

## Verification Contract

- 本地：`cd packages/frontend && pnpm vitest run` 全绿，含新增回归测试。
- 类型：`pnpm -r run typecheck` 通过。
- 手动复现路径：项目详情页（仅 1 个任务的 heading 容器）→ 展开该任务 → 添加子任务按 Enter → 行恢复正常。
