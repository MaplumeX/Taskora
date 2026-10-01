# 03 MovePicker 组件，替换 MoveField

Status: implemented — awaiting visual acceptance
Blocked by: 02

## Design

见 spec「选择器形态」和第 3 节。

- 新组件 `MovePicker` 替换 `packages/ui/src/components/task/fields/MoveField.tsx`，接口为 `current` + `onSelect(dto)`。
- 搜索框：桌面端自动聚焦，触控端（`max-md` 或 coarse pointer）不聚焦。
- 键盘：照搬 `QuickFind.tsx` 的高亮索引、`scrollIntoView`、IME 处理和 combobox ARIA。
- 行：Inbox 图标、区域 `Layers`、项目 `ProjectProgressPie`；嵌套项目缩进；Later Project 灰色；当前位置打勾；搜索结果的项目行尾显示区域名。
- 列表高度有上限，超出后在内部滚动。
- `TaskContextMenu`：选中后 patch 并 `setActivePicker(null)`。
- `MultiSelectToolbar`：`patchAll` 后 `closePicker`。
- i18n：搜索框占位、无结果文案（zh / en）。

## Acceptance

- 右键菜单 → 移动：可以搜索，`↑` / `↓` / `Enter` 能完成移动，选完自动关闭。
- 多选工具栏 → 移动：批量写入后退出多选模式。
- 不会再出现同时带项目和区域的任务。
- 组件测试覆盖：键盘选择、点击选择、打勾、无结果。

## Comments

### 2026-10-01 — 实现

- `MovePicker` 替换并删除了 `MoveField`；无搜索词时初始高亮落在当前位置；选中当前位置不写入。
- 聚焦：右键菜单的 Popover 默认聚焦首个可聚焦元素（搜索框）；多选工具栏的 `FieldPickerDialog` 本就聚焦卡片本身，触控端不弹键盘，不需要额外判断 pointer。
- 旧的 `TaskContextMenu` / `MultiSelect` 移动用例按新行为重写（option 角色、互斥 DTO、移入 Inbox 清计划、选完关闭）。新组件测试 6 个。
- 未做：没有在真实 App 里目视验收。
