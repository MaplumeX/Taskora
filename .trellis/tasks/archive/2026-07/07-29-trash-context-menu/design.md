# Design — Trash task context menu with restore

## 架构与边界

纯前端，无后端改动。`useRestoreTask` 已存在，直接复用。

在现有 `TaskContextMenu` 上增加 `variant` prop 以复用组件：

```ts
interface Props {
  task: TaskResponseDto;
  current: TaskResponseDto;
  children: React.ReactNode;
  variant?: 'default' | 'trash';   // 新增，默认 'default'
}
```

- `default`：完全不变（回归保护）。
- `trash`：菜单项前 4 个与 default 相同；末项由「删除」替换为「恢复」，调用 `useRestoreTask`。

## 组件结构

```
Trash.tsx (改)
 └─ 行容器
     └─ <TaskContextMenu variant="trash">   ← 复用
          ├─ Menu
          │    ├─ 标记完成/未完成 → complete/uncomplete
          │    ├─ 计划时间 → ScheduledDateField
          │    ├─ 到期时间 → DueDateField
          │    ├─ 标签     → TagsField
          │    └─ 恢复     → restoreTask.mutate  (新)
          └─ Picker popover
```

## 关键技术决策

### D1 用 variant 复用，而非另建组件
- 菜单结构、picker 逻辑、虚拟锚点逻辑完全相同，只有末项的文案与 mutation 不同。
- 抽出一个内部 `handle destructive` 即可：
  - `default` → `handleDelete`（`useDeleteTask`，现有）
  - `trash` → `handleRestore`（`useRestoreTask`）
- 末项文案：`default` → `tc('delete')`；`trash` → `tc('restore')`。
- 两者都用 `text-destructive` 样式（恢复是破坏性反向操作，保持视觉一致可接受；如需更弱可在实现时降级，但 PRD 不要求）。

### D2 Trash.tsx 行适配
- 当前 Trash 行是普通 `<div>`，需要包进 `<TaskContextMenu variant="trash">`。
- 移除行尾 `<Button>` 恢复按钮及其 `handleRestore`、`useRestoreTask`、`RotateCcw` 导入（这些逻辑迁入 TaskContextMenu）。
- 移除后行内只剩 checkbox + 标题 + 日期 badge，右键恢复。
- 注意：Trash 行没有 `onRowClick` / 展开态，`TaskContextMenu` 只包裹行内容，不引入展开行为。

### D3 回归隔离
- `variant` 默认 `default`，`TaskItem.tsx` 调用点不改，保证普通页面零回归。
- 仅 `Trash.tsx` 传入 `variant="trash"`。

## 数据流

- 恢复：`useRestoreTask` → invalidate `['tasks']` → 废纸篓列表移除该任务。
- 其余 mutate 路径与普通行一致（已验证过的现有逻辑）。

## i18n

无需新增 key：`common:restore`、`common:restoreFailed`、`common:restored` 已存在。

## 兼容性 / 回归注意

- `TaskContextMenu` 的 `children` 包裹方式不变，Trash 行的 flex 布局需保持原样（h-12 行高、gap、truncate）。
- Trash 行无 `onRowClick`，点击行为不变（无展开）。

## 风险

- 低。改动集中在 `TaskContextMenu` 末项分支与 `Trash.tsx` 行包裹。