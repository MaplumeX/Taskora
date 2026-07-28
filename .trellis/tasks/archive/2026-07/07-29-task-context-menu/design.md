# Design — Task item context menu

## 架构与边界

纯前端功能，无后端改动。所有数据能力（update / complete / uncomplete / delete）已在 `useTasks.ts` 提供。

新增一个 `TaskContextMenu` 组件，挂载在 `TaskItem` 的行容器上，负责：
- 监听 `onContextMenu`，阻止默认菜单，记录鼠标坐标，打开受控菜单。
- 渲染菜单项：标记完成/未完成、设置计划时间、设置到期时间、设置标签、删除。
- 日期/标签项点击后，关闭主菜单并打开对应的 picker popover（锚定到 TaskItem 行容器引用）。

## 组件结构

```
TaskItem (现有)
 ├─ <TaskContextMenu>            ← 新增，包裹行内容
 │    ├─ Menu (Popover 虚拟锚点=右键坐标)
 │    │    ├─ 标记完成/未完成 → mutate
 │    │    ├─ 设置计划时间 → 打开 ScheduledPicker popover
 │    │    ├─ 设置到期时间 → 打开 DueDatePicker popover
 │    │    ├─ 设置标签       → 打开 TagsPicker popover
 │    │    └─ 删除            → deleteTask.mutate
 │    └─ *Picker popover（受控，同一时刻最多一个）
```

## 关键技术决策

### M1 用 Popover 虚拟锚点而非 DropdownMenu
- `@radix-ui/react-dropdown-menu` 的 `Content` 在 Portal 内，只能相对 `Trigger` 元素定位，不支持任意坐标；右键菜单需要定位到鼠标坐标。
- `@radix-ui/react-popover` 已安装，支持 `PopoverAnchor` + 虚拟元素 `{ getBoundingClientRect: () => ({x,y,width:0,height:0,top:y,right:x,bottom:y,left:x}) }`，可精确锚定到右键坐标。
- 备选：引入 `@radix-ui/react-context-menu`（原生右键语义、submenu、键盘导航全套）。**本任务不引入新依赖**，用 Popover 虚拟锚点；如交互复杂度后续增长再评估替换。已记为 Deferred。

### M2 Picker 复用：抽取共享子组件
抽取 `TaskRowExpanded.tsx` 中三段 picker 内部内容为独立小组件，消除重复：
- `ScheduledDateField`：scheduledType 切换 + 日期 input
- `DueDateField`：dueDate 日期 input
- `TagsField`：标签多选列表

小组件约定（统一 prop 形状）：
```ts
interface FieldProps {
  current: TaskResponseDto;
  onPatch: (data: UpdateTaskDto) => void;
}
```
TaskRowExpanded 与 TaskContextMenu 均通过 `onPatch` 调用 `patch`，逻辑与 invalidation 仍由各自父组件管理，不重复 mutation 逻辑。

### M3 菜单项的菜单语义
- 用普通 button 列表实现菜单项（Popper 定位 + 点击外部关闭由 Popover 提供）。
- 键盘可达性：menu 打开后 autoFocus 第一项；项间用方向键移动（实现一个极简 roving-tabindex，或退化为 Tab 顺序）。MVP 用 Tab + Enter 即满足基本可达性，方向键作为可选增强。
- 重点：MVP 先保证 mouse 交互正确 + 基本 focus 回退；完整 roving 方向键导航列为 Deferred。

### M4 状态管理（TaskContextMenu 内部 state）
```ts
type PickerKind = 'scheduled' | 'due' | 'tags' | null;
const [menuOpen, setMenuOpen] = useState(false);
const [anchor, setAnchor] = useState<{x:number;y:number} | null>(null);
const [activePicker, setActivePicker] = useState<PickerKind>(null);
```
- onContextMenu: preventDefault; setAnchor({x,y}); setMenuOpen(true)
- 点选 picker 项: setMenuOpen(false); setActivePicker(kind)
- picker popover onOpenChange(false): setActivePicker(null)

## 数据流

右键菜单的 mutate 路径与 `TaskRowExpanded` 完全一致：
- patch: `useUpdateTask` → invalidate detail + list
- complete/uncomplete: `useCompleteTask`/`useUncompleteTask`
- delete: `useDeleteTask`（软删除）

完成后 `TaskItem` 通过 `useTaskQuery` + `['tasks']` 自动反映新状态（标签点、日期 badge、完成划线、从列表消失）。

## i18n 新增 key

仅 `task.json` 新增（中/英）：
- `markComplete` / `markIncomplete`
- 其余菜单项复用 `task:scheduledDate`、`task:dueDate`、`task:tags`、`common:delete`

## 兼容性 / 回归注意

- TaskContextMenu 包裹在 TaskItem 行容器上，不得干扰现有 `onClick`（展开行）、`onToggleComplete`、拖拽排序（如有）。
- onContextMenu 只在主任务行触发；子任务行（TaskRowExpanded 内）不挂载。
- 抽取 Field 组件时，TaskRowExpanded 的现有行为须保持像素级一致（回归重点）。

## 风险

- 抽取 TaskRowExpanded picker 可能引入回归 → 用 implement 的验证步骤（展开行 picker 仍正常）覆盖。
- Popover 虚拟锚点在窗口边缘可能溢出 → radix Popover 内置 collisionAvoidance，可接受。

## Deferred

- 方向键 roving 导航（M3）。
- 引入 `@radix-ui/react-context-menu` 以获得原生 submenu（若后续要日期/标签做成 submenu 而非二级 popover）。
- 批量多选右键菜单。
