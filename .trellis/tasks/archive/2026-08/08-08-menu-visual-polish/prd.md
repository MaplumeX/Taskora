# 统一菜单视觉美化（图标+分组+分隔线）

## Goal

为所有弹出菜单统一添加图标、分组分隔线，并强化危险项 hover 样式，使其摆脱默认 shadcn 纯文字堆叠风格，向 Things3 / Linear 的精致度靠拢。

## Background

当前菜单分两类实现：
- **Popover 手写菜单**：`TaskContextMenu`、`ProjectContextMenu`（`ProjectMenuPanel`）、`AreaMoreMenu` — 纯文字 button 堆叠，无图标、无分组，三处各自定义了相同的 `MENU_ITEM_CLASS` 常量
- **DropdownMenu 组件**：`SidebarBottomBar`（新增/设置菜单）、`ProjectHeadingRow`（heading 操作菜单）— 部分已有图标（`FolderInput`/`Trash2`/`SunMedium` 等），但危险项 hover 仍用泛灰 `bg-accent`

## In Scope

1. **图标**：为 `TaskContextMenu`、`ProjectContextMenu`、`AreaMoreMenu` 的每个菜单项添加语义对应的 lucide 图标
2. **分组分隔线**：在语义分组的菜单项之间加分隔线（完成 / 日期标签 / 转换 / 危险操作）
3. **危险项强化**：删除/恢复项 hover/focus 时用 `bg-destructive/10 text-destructive`，不再用泛灰 `bg-accent`
4. **`SidebarBottomBar` 语言切换**：当前选中态从 `●` 圆点改为 `Check` 图标，未选中不渲染
5. **提取共享 `MenuRow` 组件**：消除三处重复的 `MENU_ITEM_CLASS`，统一图标+文字+危险态布局

## Out of Scope

- 快捷键提示（shortcut hint）— 装饰性 shortcut 会误导用户，后续如需真实快捷键作为独立任务
- 毛玻璃 / 缩放动效 / 箭头指示（方案 C 内容）
- 菜单浮层阴影 / 圆角 / 边框调整（方案 A 内容）
- 新增菜单项或改变现有菜单项顺序/行为

## Requirements

### R1: 图标映射

| 菜单项 | 图标 | 语义 |
|--------|------|------|
| 标记完成 | `Check` | 完成 |
| 标记未完成 | `Circle` | 未完成（空心圆） |
| 计划日期 | `CalendarClock` | 计划 |
| 到期日期 | `CalendarDays` | 到期 |
| 标签 | `Tag` | 标签 |
| 转为项目 | `FolderInput` | 转换（与 `ProjectHeadingRow` 一致） |
| 删除 | `Trash2` | 删除 |
| 恢复 | `RotateCcw` | 恢复 |

### R2: 分组分隔线

- **TaskContextMenu / ProjectContextMenu**：4 组
  1. `[完成]`
  2. `[计划日期 | 到期 | 标签]`
  3. `[转为项目]`（仅 `variant=default`）
  4. `[删除] / [恢复]`
- **AreaMoreMenu**：2 组
  1. `[标签]`
  2. `[删除]`

### R3: 危险项样式

- Popover 手写菜单（`MenuRow`）：`hover:bg-destructive/10 hover:text-destructive`
- DropdownMenuItem：`focus:bg-destructive/10 focus:text-destructive`

### R4: `SidebarBottomBar` 语言切换

- 当前语言：`Check` 图标（`opacity-100`）
- 非当前语言：不渲染图标（保留 `mr-2 h-4 w-4` 占位保持对齐）

### R5: 共享 `MenuRow` 组件

- 位置：`src/components/common/MenuRow.tsx`
- 封装 `MENU_ITEM_CLASS` + 图标 slot + `destructive` variant
- 被 `TaskContextMenu`、`ProjectMenuPanel`、`AreaMoreMenu` 引用

## Acceptance Criteria

- [ ] `TaskContextMenu` 每个菜单项左侧有对应 lucide 图标，分组间有分隔线
- [ ] `ProjectContextMenu`（`ProjectMenuPanel`）同上，`variant=trash` 时末项为恢复（`RotateCcw`）
- [ ] `AreaMoreMenu` 标签项有 `Tag` 图标，删除项有 `Trash2` 图标，两者间有分隔线
- [ ] 所有危险项（删除/恢复）hover/focus 时背景为 `destructive/10`、文字为 `destructive`
- [ ] `SidebarBottomBar` 语言切换当前项显示 `Check`，非当前项无图标但保持对齐
- [ ] `MenuRow` 组件被三处菜单共用，`MENU_ITEM_CLASS` 不再在各文件内重复定义
- [ ] 现有测试通过（`ProjectHeadingRow.test.tsx` 等）
- [ ] 暗色模式下视觉正确（图标颜色跟随 `currentColor`）

## Technical Notes

- 图标尺寸统一 `h-4 w-4`，与现有 `ProjectHeadingRow` / `SidebarBottomBar` 一致
- 分隔线用 `<div className="-mx-1 my-1 h-px bg-muted" />`（与 `DropdownMenuSeparator` 样式一致）
- `MenuRow` 的 `destructive` prop 控制 hover 样式，不破坏现有 `text-destructive` 静态色
- `ProjectHeadingRow` 的 DropdownMenu 已有图标，仅需补危险项 `focus:bg-destructive/10`
- `SidebarBottomBar` 新增菜单项可加图标（`FolderPlus` 新项目、`Layers` 新区域），但属可选增强