# Task item context menu

## Goal

为任务条目添加右键菜单功能，让用户在不展开任务行的情况下，快速完成常见操作：设置计划时间、设置到期时间、设置标签、标记完成/未完成、删除。提升任务批量管理的效率。

## Background / Confirmed Facts（来自代码库）

- 主任务行组件 `packages/frontend/src/components/task/TaskItem.tsx`，已支持点击展开、`onToggleComplete`、行点击等交互。
- 展开态 `TaskRowExpanded.tsx` 已经实现所有需要的编辑能力，以 `IconPopover`（基于 `@/components/ui/popover`）形式存在：
  - 计划时间：scheduledType（NONE / DATE / SOMEDAY）+ 日期 input
  - 到期时间：dueDate 日期 input
  - 标签：从 `useTagsQuery` 列出全部标签，多选切换 `tagIds`
- 数据层 hooks 已齐全（`packages/frontend/src/lib/hooks/useTasks.ts`）：
  - `useUpdateTask`（patch：title/notes/scheduledType/scheduledDate/dueDate/projectId/areaId/tagIds）
  - `useCompleteTask` / `useUncompleteTask`
  - `useDeleteTask`（软删除，可在 Trash 恢复）
- 调研后选用 `@radix-ui/react-popover` 虚拟锚点实现右键菜单定位（已安装，无需新依赖）；`@radix-ui/react-dropdown-menu` 因其 Content 仅能相对 Trigger 定位、无法锚定鼠标坐标，不用于本任务的右键触发，详见 design.md M1。
- i18n：`packages/frontend/src/i18n/locales/{en,zh}/task.json` 已有 `scheduledDate`、`dueDate`、`tags`、`somedayLabel`，`common.json` 已有 `delete`/`saveFailed`/`none`，菜单项复用；仅需新增 `markComplete`/`markIncomplete` 两个 key。
- 范围确认（与用户）：右键菜单仅作用于主任务列表的 `TaskItem`；子任务行与 Trash 列表暂不加。

## Requirements

### R1 右键菜单触发
- 在主任务行 `TaskItem` 上，通过原生 `contextmenu` 事件（右键）打开菜单。
- 菜单定位到右键时的鼠标坐标（虚拟锚点），不新增可见按钮。
- 阻止浏览器默认右键菜单。

### R2 菜单项
菜单应包含以下条目（顺序为推荐）：
1. 标记完成 / 标记未完成（根据 `current.status` 切换文案）
2. 设置计划时间（scheduledType + 日期：复用现有 NONE/DATE/SOMEDAY 逻辑）
3. 设置到期时间（dueDate 日期选择）
4. 设置标签（多选切换 tagIds，复用 `useTagsQuery`）
5. 删除（软删除）

### R3 交互与数据
- 复用 `TaskRowExpanded` 中验证过的 patch / complete / uncomplete / delete 逻辑与 invalidation 策略，避免重复实现导致行为不一致。
- 操作成功/失败反馈沿用现有 `toast`（`sonner`）与 i18n key。
- 右键菜单操作不应破坏现有「点击展开行」「双击标题编辑」等交互。

### R4 国际化与可访问性
- 所有菜单文案走 i18n（中/英）。
- 键盘可达性：菜单打开后 autoFocus 首项，支持 Esc 关闭、Tab 项间移动 + Enter 触发；方向键 roving 导航列为 Deferred（详见 design.md M3）。不新增可见按钮，故无「⋯」aria-label 需求。

## Acceptance Criteria

- [ ] 在主任务行上右键可在鼠标坐标处打开右键菜单（且阻止浏览器默认菜单）。
- [ ] 菜单含 5 类操作：完成切换、计划时间、到期时间、标签、删除。
- [ ] 标记完成/未完成：点击后状态正确切换，列表与详情刷新一致。
- [ ] 设置计划时间：可在 DATE/SOMEDAY/NONE 间切换，DATE 模式可指定日期，保存后 `TaskDateBadge` 正确反映。
- [ ] 设置到期时间：可设置/清除日期，保存后 `TaskDueDateBadge` 正确反映。
- [ ] 设置标签：可多选切换标签，保存后行内标签色点正确反映。
- [ ] 删除：点击后直接软删除（无二次确认），任务从列表移除，可在 Trash 恢复。
- [ ] 新增的 markComplete/markIncomplete 文案中英文齐全；菜单支持 Esc 关闭与 Tab 导航。
- [ ] 现有交互（点击展开、完成切换、拖拽排序）未回归；抽取 Field 后展开行 picker 仍正常工作。

## Out of Scope

- 子任务行的右键菜单。
- Trash 列表任务项的右键菜单。
- 批量多选任务的右键菜单。
- 项目/区域归属的右键修改（本次仅计划时间、到期时间、标签、完成、删除）。

## Resolved Decisions（用户确认）

- D1 触发方式：仅原生右键（不加 hover「⋯」按钮）。
- D2 日期/标签子交互：点击菜单项后打开 popover picker（复用 `TaskRowExpanded` 的 picker 逻辑）。
- D3 删除：直接软删除，不二次确认（与子任务删除一致；可在 Trash 恢复）。
- D4 作用范围：仅主任务列表 `TaskItem`。
