# Implement — ProjectContextMenu

## 执行顺序

### Step 1: 新增 `ProjectContextMenu` + `ProjectMoreMenu` 组件
- 文件：`packages/frontend/src/components/project/ProjectContextMenu.tsx`
- 参照 `TaskContextMenu` 实现：
  - 主菜单（右键虚拟锚点 + `Popover`），`variant` 控制 删除/恢复。
  - picker 二级 `Popover`（锚点为容器），复用 `ScheduledDateField` / `DueDateField` / `TagsField`。
  - 菜单项自动聚焦第一项。
  - 导出两个组件：
    - `ProjectContextMenu`：包裹 children，右键打开（`onContextMenu`）。
    - `ProjectMoreMenu`：trigger 槽位，点击打开；内部共享 `ProjectMenuPanel`。
  - 内部 `ProjectMenuPanel`：渲染菜单项按钮 + picker 二级 Popover；接收 `project/current/variant`，自行管理 picker 状态。
- hooks：`useCompleteProject` / `useUncompleteProject` / `useDeleteProject` / `useRestoreProject` / `useUpdateProject`。
- 字段 cast：`fieldCurrent = current as unknown as Parameters<typeof ScheduledDateField>[0]['current']`，`fieldPatch = patch as unknown as ...`。

### Step 2: `ProjectItem` 接入右键菜单
- 文件：`packages/frontend/src/components/project/ProjectItem.tsx`
- 外层用 `ProjectContextMenu` 包裹现有 `<button>`。
- `current` 直接用 `project`（项目列表数据为最新；详情页已有独立 hook 调用）。
- 保留 `onClick` 导航、`taskCount`、`showChevron`。
- 右键时 `preventDefault` 由 `ProjectContextMenu` 处理，不影响 button。

### Step 3: `ProjectFeedRow` 接入右键菜单
- 文件：`packages/frontend/src/components/feed/ProjectFeedRow.tsx`
- 外层用 `ProjectContextMenu` 包裹，`variant={item.status === 'TRASHED' ? 'trash' : 'default'}`。
- `project={item as unknown as ProjectResponseDto}`、`current={item as unknown as ProjectResponseDto}`。
- 保留现有 `onClick` 导航。

### Step 4: `ProjectDetail` 替换三按钮为「更多」按钮
- 文件：`packages/frontend/src/pages/ProjectDetail.tsx`
- 删除「Field editing row」整段（三个 `IconPopover`）及 `IconPopover` 函数定义。
- 标题行右侧添加 `<ProjectMoreMenu project={project} current={project} />`（仅 project 存在时）。
- 标题行布局：`<div className="flex items-center justify-between">` 左侧 `InlineTitleEdit`，右侧 `ProjectMoreMenu`。
- 移除不再使用的 import（`Calendar` / `Clock` / `Tag` / `Popover` / `PopoverContent` / `PopoverTrigger` / `cn` / `ScheduledDateField` / `DueDateField` / `TagsField` / `Button`，若仅在删除段使用）。

### Step 5: i18n 补充
- 检查 `common:more` key 是否存在；不存在则在 `zh/common.json` + `en/common.json` 新增 `"more": "更多"` / `"more": "More"`。
- 其余菜单文案复用现有 key。

### Step 6: 校验
- `pnpm --filter frontend typecheck`（或项目实际命令）。
- `pnpm --filter frontend build`。
- 修复任何类型 / 未使用 import 错误。

## 验证命令
```bash
pnpm --filter @taskora/frontend typecheck
pnpm --filter @taskora/frontend build
```

## 回滚点
- 每步独立 commit 前确认编译通过；Step 2/3 改动失败可单独回退而不影响 Step 1 的新组件文件。