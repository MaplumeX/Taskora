# Design — ProjectContextMenu

## 组件结构

新增 `packages/frontend/src/components/project/ProjectContextMenu.tsx`，结构镜像 `TaskContextMenu`：

```
<div ref={containerRef} onContextMenu={onContextMenu}>
  {children}
  <Popover open={menuOpen} ...>       // 主菜单，虚拟锚点 = 右键坐标
    <PopoverContent>
      标记完成/未完成
      日期 → openPicker('scheduled')
      到期 → openPicker('due')
      标签 → openPicker('tags')
      删除 / 恢复（variant 决定）
    </PopoverContent>
  </Popover>
  <Popover open={activePicker !== null} ...>  // picker，锚点 = containerRef
    <PopoverContent>{picker}</PopoverContent>
  </Popover>
</div>
```

## Props

```ts
interface Props {
  project: ProjectResponseDto;
  current: ProjectResponseDto;   // 避免过时值，与 TaskContextMenu 一致
  children: React.ReactNode;
  variant?: 'default' | 'trash';  // 默认 'default'，trash 显示「恢复」
}
```

- `project` 与 `current` 在项目场景里通常是同一对象，但保留双值以与 `TaskContextMenu` 形态一致，便于后续接入实时查询。
- `children` 即被包裹的行内容（`ProjectItem` 内部内容 / feed row 等）。

## 菜单项逻辑

| 项 | 文案 | 行为 |
|---|---|---|
| 完成/未完成 | `task:markComplete` / `task:markIncomplete` | `current.status==='COMPLETED'` ? `useUncompleteProject` : `useCompleteProject` |
| 日期 | `task:scheduledDate` | openPicker('scheduled') → `ScheduledDateField` |
| 到期 | `task:dueDate` | openPicker('due') → `DueDateField` |
| 标签 | `task:tags` | openPicker('tags') → `TagsField` |
| 删除/恢复 | `common:delete` / `common:restore` | default: `useDeleteProject` (destructive) / trash: `useRestoreProject` |

`patch` 走 `useUpdateProject`，成功后 invalidate `projectKeys.detail(id)` + `projectKeys.all` + `['feed']`（与 hook 默认行为一致，组件内可只调 mutate）。

## 字段组件兼容

`ScheduledDateField` / `DueDateField` / `TagsField` 的 props 期望 `TaskResponseDto` + `UpdateTaskDto`，但它们实际读取的字段（`scheduledType` / `scheduledDate` / `dueDate` / `tags`）在 `ProjectResponseDto` / `UpdateProjectDto` 上同名同义。沿用 `ProjectDetail` 现有的 cast 模式：

```ts
const fieldCurrent = current as unknown as Parameters<typeof ScheduledDateField>[0]['current'];
const fieldPatch = patch as unknown as Parameters<typeof ScheduledDateField>[0]['onPatch'];
```

## 接入点改造

### ProjectItem
- 当前是一个 `<button>`。改为外层用 `ProjectContextMenu` 包裹，内部保留原 button 用于导航。
- 右键触发由 `ProjectContextMenu` 的容器处理；button 的 `onClick` 导航不变。
- 不再传 `showChevron` 的 button 结构受影响：右键菜单不需要改 button 内部布局。

### SortableProjectItem（侧边栏 / AreaDetail）
- 外层 `useSortable` 的 div 持有 `listeners`，`ProjectContextMenu` 在其内层。右键 `preventDefault` + 打开菜单，不触发拖拽（拖拽靠 pointer down + distance:5）。
- 侧边栏版本与 AreaDetail 版本结构略有不同，但都包裹同一个 `ProjectItem`，统一在 `ProjectItem` 内部接入即可，无需改两个 Sortable 包装。

### ProjectFeedRow
- 直接用 `ProjectContextMenu` 包裹现有内容。`variant` 取 `item.status === 'TRASHED' ? 'trash' : 'default'`。
- 注意 feed item 是 `ProjectFeedItem` 而非 `ProjectResponseDto`，但菜单需要的字段（id/status/scheduledType/scheduledDate/dueDate/tags）两者都有；`ProjectFeedItem` 缺 `notes` 等不影响菜单。需要确认 `ProjectFeedItem` 类型，若不便兼容可在 feed row 场景传入 `project={item as unknown as ProjectResponseDto}`。

### ProjectDetail
- 删除 `<div className="flex items-center gap-1">` 的三按钮行及 `IconPopover` 函数。
- 标题行右侧添加「更多」按钮：
  ```tsx
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="icon" aria-label={t('common:more')}><MoreHorizontal .../></Button>
    </PopoverTrigger>
    <PopoverContent>
      <ProjectMenuItems project={project} ... />
    </PopoverContent>
  </Popover>
  ```
- 为复用菜单项渲染逻辑，将 `ProjectContextMenu` 的菜单项部分抽取为内部 `ProjectMenuItems`（或独立小组件），同时供右键菜单和「更多」按钮使用。

## 复用策略：抽取菜单项

`ProjectContextMenu` 拆为：
- `ProjectMenuItems`（纯菜单项列表，接收 project/current/variant + closeMenu + openPicker 回调）
- `ProjectContextMenu`（右键版：含虚拟锚点 + 主菜单 Popover + picker Popover，渲染 `ProjectMenuItems`）
- 「更多」按钮在 `ProjectDetail` 内直接用一个普通 Popover 包 `ProjectMenuItems`，并共享同一套 picker 处理。

为避免两处重复实现 picker，方案：在 `ProjectDetail` 不直接用 `ProjectMenuItems`，而是用一个 `ProjectMoreMenu` 组件（trigger = MoreHorizontal 按钮，内容 = `ProjectMenuItems` + picker 二级 Popover）。与右键版共享 `ProjectMenuItems` 和 picker 状态逻辑。

简化：把"菜单项 + picker"整体抽成一个 hook `useProjectMenu(project, current, variant)` 返回 `{ menuItems, pickerNode, closeAll }`，右键版和更多版都调用。但这会增加复杂度。

**最终方案**（最小改动）：
- `ProjectContextMenu` 保留虚拟锚点右键模式，导出为默认右键菜单包裹器。
- 同时导出 `ProjectMoreMenu`：trigger 槽位由外部传入（或内置 MoreHorizontal），Popper 锚点为 trigger，内容与右键菜单一致（含 picker）。两者共享一个内部 `ProjectMenuPanel` 组件渲染菜单项 + picker。

## i18n
- 复用 `task:markComplete` / `markIncomplete` / `scheduledDate` / `dueDate` / `tags`，`common:delete` / `restore` / `saveFailed`。
- 「更多」按钮 aria-label 用 `common:more`，需确认是否已有；若无则新增 `more` key（zh/zh、en）。

## 风险 / 兼容
- 字段组件 cast 类型：与现有 `ProjectDetail` 一致，无新增风险。
- 右键菜单在 dnd-kit listeners 节点内部：`onContextMenu` 不参与 pointer 拖拽判定，安全。
- feed `ProjectFeedItem` 类型差异：用 cast，菜单只读共有字段。

## 不改动
- 后端、project hooks、字段组件、`TaskContextMenu`。