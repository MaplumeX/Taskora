# Add context menu and more menu for project items

## Goal

为项目条目提供与任务条目一致的右键上下文菜单，并将项目详情页顶部的三个字段编辑按钮替换为标题旁的「更多」按钮，其弹出内容与右键菜单完全一致。

## Background

- 任务条目已有 `TaskContextMenu`，支持右键打开菜单，菜单项点击后打开对应 picker（日期/到期/标签），并支持 `variant='trash'` 下的「恢复」操作。
- 项目条目（`ProjectItem` / `SortableProjectItem` / `ProjectFeedRow`）目前仅是导航按钮，无右键菜单。
- 项目详情页（`ProjectDetail`）顶部用 3 个 `IconPopover` 按钮（日历/时钟/标签）编辑字段，需要替换为标题后的「更多」按钮。
- 项目侧已有完整的 hooks：`useCompleteProject` / `useUncompleteProject` / `useDeleteProject` / `useRestoreProject` / `useUpdateProject`。

## Requirements

### R1 新增 ProjectContextMenu 组件
- 参照 `TaskContextMenu` 的结构（右键虚拟锚点 + 主菜单 + picker 二级 Popover）。
- 菜单项（按顺序）：
  1. 标记完成 / 标记未完成（根据 `current.status === 'COMPLETED'` 切换文案）
  2. 日期（打开 `ScheduledDateField` picker）
  3. 到期（打开 `DueDateField` picker）
  4. 标签（打开 `TagsField` picker）
  5. 删除（`variant='default'`）或 恢复（`variant='trash'`），删除项使用 destructive 样式
- 通过 props 控制是否显示「恢复」：`variant?: 'default' | 'trash'`，默认 `default`。
- 字段 picker 复用现有 `ScheduledDateField` / `DueDateField` / `TagsField`，`current` 以 `ProjectResponseDto` 兼容传入（字段名与 `TaskResponseDto` 对齐），`onPatch` 走 `useUpdateProject`。
- 打开菜单时自动聚焦第一个菜单项，与 `TaskContextMenu` 行为一致。
- 菜单与 picker 的 Popover 点击事件 `stopPropagation`，避免误触发导航。

### R2 项目条目支持右键菜单
- `ProjectItem` 支持右键打开 `ProjectContextMenu`；保留现有点击导航行为。
- `SortableProjectItem`（侧边栏）包装 `ProjectItem` 时，右键菜单同样可用，且不影响 dnd-kit 拖拽。
- `ProjectFeedRow`（feed 聚合行）支持右键打开 `ProjectContextMenu`（`variant` 根据状态：trashed 时为 `trash`）。
- `AreaDetail` 中的 `SortableProjectItem` 同样支持右键菜单。

### R3 项目详情页替换为「更多」按钮
- 移除 `ProjectDetail` 中的三个 `IconPopover` 字段编辑按钮行（日历/时钟/标签）。
- 在项目标题行右侧添加一个「更多」按钮（`MoreHorizontal` 图标，ghost 样式）。
- 点击「更多」按钮弹出的菜单内容与右键菜单完全一致（同一 `ProjectContextMenu` 或等价内容），即标记完成、日期、到期、标签、删除。
- 标题与「更多」按钮在同一行；标题仍可内联编辑（`InlineTitleEdit`）。

### R4 i18n
- 复用现有 `task` 命名空间的 key（`markComplete` / `markIncomplete` / `scheduledDate` / `dueDate` / `tags`）与 `common` 命名空间的 `delete` / `restore` / `saveFailed`。
- 如需项目专属 key 再补充到 `project` 命名空间。

## Acceptance Criteria

- [ ] 新增 `ProjectContextMenu` 组件，菜单项与顺序符合 R1，picker 复用现有字段组件。
- [ ] 项目条目（`ProjectItem` / `SortableProjectItem` / feed 行 / AreaDetail 行）右键可打开菜单，左键导航不受影响。
- [ ] `ProjectDetail` 不再显示 3 个 IconPopover 按钮；标题后显示「更多」按钮，弹出内容与右键菜单一致。
- [ ] `variant='trash'` 时显示「恢复」而非「删除」，并调用 `useRestoreProject`。
- [ ] 完成切换、字段更新、删除、恢复均触发对应 project hooks，并正确 invalidate `projectKeys` 与 `['feed']`。
- [ ] 中英文 i18n 均可用，无缺失 key。
- [ ] 类型检查与构建通过（`pnpm typecheck` / `pnpm build` 或等价命令）。

## Notes

- 字段组件签名期望 `TaskResponseDto` / `UpdateTaskDto`，项目字段名对齐，沿用 `ProjectDetail` 现有的兼容 cast 模式。
- 不改动后端；仅前端组件与 hook 调用层。
- 不改动 `TaskContextMenu` 本身。