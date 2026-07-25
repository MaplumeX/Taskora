# Component Guidelines

> How components are built in this project.

---

## Overview

- 框架：React 18 + TypeScript
- 样式：Tailwind CSS + shadcn/ui
- 组件目录：`src/components/`，按业务域分组（task/project/area/layout/ui）
- 页面组件在 `src/pages/`，复用组件在 `src/components/`

---

## Component Structure

```tsx
// 1. imports（React, hooks, UI 组件, 类型）
// 2. props interface（如有）
// 3. 组件函数
// 4. 导出

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { TaskResponseDto } from '@taskora/shared';

interface TaskItemProps {
  task: TaskResponseDto;
  onComplete?: (id: string) => void;
}

export function TaskItem({ task, onComplete }: TaskItemProps) {
  // ...
}
```

---

## Props Conventions

- 用 `interface` 定义 props，命名 `XxxProps`
- 类型从 `@taskora/shared` 引用 DTO，不重复定义
- 可选 callback props 加 `?`（如 `onComplete?`）

---

## Styling Patterns

- Tailwind utility classes，不用 CSS modules
- shadcn/ui 组件作为基础，用 `className` prop 覆盖样式
- `cn()` 工具函数（`src/lib/utils.ts`）合并条件类名
- Things3 配色：主色蓝 `primary`（浅色 HSL `218 45% 54%` ≈ #4477CE；暗色 `218 65% 62%` 提亮避免暗底发闷）
- 主题色全部走 CSS 变量（HSL，定义在 `src/index.css` 的 `:root` 和 `.dark`），不硬编码 `bg-white`/`text-black` 类
- 暗色模式：`tailwind.config.js` 已开 `darkMode: ['class']`，`<html>` 上切换 `.dark` class

### 主题系统约定

**三态模式**：`'light' | 'dark' | 'system'`（system 跟随 `prefers-color-scheme`）

**FOUC 防护（关键）**：在 `main.tsx` 的 `ReactDOM.createRoot().render()` **之前**同步调用 `applyThemeFromStorage()`。不能等 React 渲染后再加 `.dark` class，否则首帧会浅后暗闪屏。

**切换器**：Sidebar 底部单点，三态循环 light → dark → system → light。图标用 `SunMedium`/`Moon`/`Monitor`，避开 Sidebar 已用于 Today 的 `Sun`。

---

## Common Mistakes

### 主题在 React 渲染后才应用导致 FOUC

**Symptom**：刷新页面时暗色用户先看到一帧浅色再变暗

**Cause**：在组件内 `useEffect` 才加 `.dark` class，此时首帧已绘制

**Fix**：在 `main.tsx` render 前同步调用 `applyThemeFromStorage()`（直接操作 `document.documentElement`），hook 只负责后续切换与监听。

### 子任务在列表中重复显示

**Symptom**：子任务既出现在主列表中，又出现在父任务详情中

**Cause**：后端 `GET /tasks` 返回所有任务（含子任务），前端未过滤 `parentId`

**Fix**：在 `TaskList` 中过滤掉 `parentId != null` 的任务，子任务仅在父任务详情中呈现：

```tsx
const topLevelTasks = tasks.filter((t) => !t.parentId);
```

### 展开行直接用列表数据导致子任务不刷新

**Symptom**：展开区中"暂无子任务"常驻，新增子任务后不更新

**Cause**：`TaskRowExpanded` 直接使用列表传入的 task 对象，该对象不含 children（`GET /tasks` 不 include children）

**Fix**：`TaskRowExpanded` 内部用 `useTaskQuery(task.id)` 获取含 children 的实时数据，子任务操作后 invalidate 父任务 detail query。

---

## 标签徽章与多选

### 标签徽章（TaskItem）

- `TaskItem` 在标题右侧渲染小色块（`h-2.5 w-2.5 rounded-full`）表示标签，取自 `task.tags` 数组的 `color` 字段，最多展示 5 个，用 `title` attribute 提供标签名 tooltip。
- 徽章用 `style={{ backgroundColor: tag.color }}` 渲染内联色，不依赖 Tailwind 绐定。

### 日期徽章（TaskItem）

- `TaskItem` 在标题右侧渲染两个日期徽章（顺序：计划日期 → 到期日期）：
  1. `TaskDateBadge` — 计划日期（`task.scheduledDate`），使用 `Calendar` 图标
  2. `TaskDueDateBadge` — 到期日期（`task.dueDate`），使用 `Clock` 图标
- 两者复用 `formatDateLabel` / `isOverdue` / `isToday`（`@/lib/utils/date`），今天/逾期渲染为 `text-[#CC4444]`，其余 `text-muted-foreground`
- 日期为 `null` 时徽章组件返回 `null`（不渲染）
- `Calendar` 与 `Clock` 两个图标区分两个日期语义，勿混用

### 日期编辑 Popover（TaskRowExpanded 内的 Popover 菜单）

- 任务展开区有两个并列的日期编辑 Popover：
  1.「计划日期」— `Calendar` 图标，编辑 `scheduledDate` + `scheduledType`（NONE/DATE/SOMEDAY 三态）
  2.「到期」— `Clock` 图标，编辑 `dueDate`（仅 `<input type="date">`，无 scheduledType）
- 两者都复用 `IconPopover` 组件，清空输入框时分别置为 `ScheduledType.NONE` / `null`
- 更新走 `useUpdateTask`，成功后 invalidate `task.detail` 与 `['tasks']` 两个 queryKey

### 标签多选（TaskRowExpanded 内的 Popover 菜单）

- 任务展开区（`TaskRowExpanded`）的标签图标点击后弹出 Popover 菜单，内含可多选的标签列表：当前选中为高亮（背景=标签色、字白），未选为淡化（opacity-40）。
- 点击标签项调用 `useUpdateTask` 传 `tagIds` 全量数组（去重或移除该标签），符合后端 set 语义。
- 标签数据由 `useTagsQuery()` 获取（用户级），当前任务的标签由 `useTaskQuery(id).tags` 预选。
- 更新后 invalidate `tasks` 与 `task.detail` 两个 queryKey，确保列表徽章即时刷新。

---

## 行内展开交互模式（Things 3 风格）

任务编辑采用列表行内展开，不使用弹窗 Dialog。交互状态机：

- `idle`（未选中）→ 单击行 → `selected`（高亮）
- `selected` → 单击同一行 → `expanded`（原位展开编辑区 `TaskRowExpanded`）
- `expanded` → 单击同一行 → 回到 `selected`（折叠）
- 单击他行 → 当前行折叠并取消，他行变 `selected`
- 点击列表空白 → 全部回到 `idle`

**状态归属**：`selectedId` 为列表级瞬态用 `useState`（在 `TaskListView` / `Logbook` 中）；`expandedId` 派生自 URL `?expand=<id>`（`useSearchParams`，写时 `replace: true` 避免污染历史栈），以便跨组件（如底部共享栏创建任务后）能驱动某行展开。均抽成 `useTaskRowSelection()` hook 复用。**不放入 Zustand**（遵循 state-management 规范：Zustand 仅放 auth/token 等跨页面持久状态）。

**事件隔离（关键）**：展开区内的交互不能冒泡到外层空白点击 handler，否则会误折叠：

- 展开区根 div：`onClick={e => e.stopPropagation()}`
- `PopoverContent`：`onClick` 需 `stopPropagation`（Radix Popover 通过 Portal 渲染，事件仍会冒泡到 document）
- 子任务编辑 input：`onClick` 需 `stopPropagation`
- checkbox：已有 `stopPropagation`，不参与状态机

## Accessibility

- 表单 Input 配 `<Label>`
- 按钮 有 `aria-label`（图标按钮）
- 图标小菜单用 shadcn/ui 的 Popover 组件（基于 Radix Popover）
---

## 拖拽排序（DnD）模式

### 库选型：dnd-kit

- **用** `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- **不用** `react-beautiful-dnd`：2023 年起停止维护，React 18 严格模式下有副作用警告，不支持键盘拖拽

### SortableItem 包装组件模式

不修改原有展示组件（如 `TaskItem`、`ProjectItem`），在其之上包一层 `useSortable` 包装组件，保持展示组件可复用：

```tsx
function SortableTaskItem({ task, ...props }: SortableTaskItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),  // 用 Translate 而非 Transform
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <TaskItem task={task} {...props} />
    </div>
  );
}
```

**关键**：`transform` 用 `CSS.Translate.toString(transform)` 而非 `CSS.Transform.toString()`——Translate 只产生 `translate3d`，不会与子元素的 CSS 动画（如 `.task-complete-anim`）冲突。

### DndContext + SortableContext 结构

```tsx
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
    <div className="flex flex-col">{renderItems()}</div>
  </SortableContext>
</DndContext>
```

- `closestCenter` 适合垂直列表
- `verticalListSortingStrategy` 性能好
- `items` 传 id 数组给 `SortableContext`

### 点击与拖拽隔离：PointerSensor activationConstraint

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
);
```

- `distance: 5`：拖动 5px 才认为是拖拽，否则视为点击
- 避免 `onRowClick` 状态机（selected → expanded）在拖拽时误触发
- 若仍误触发，可调到 8px

### sortable prop 退化

列表组件（如 `TaskList`）通过 `sortable?: boolean = true` prop 控制：

```tsx
if (!sortable || !onReorder) {
  return <div className="flex flex-col">{renderItems()}</div>;  // 纯展示，无 DnD
}
```

- `SearchModal`、`Trash`、`Logbook` 等不应拖拽的页面传 `sortable={false}`
- `Upcoming` 不走 `TaskListView`，自己渲染 `TaskItem`，天然无 DnD

### Common Mistake: useSensors 在 early return 之后调用

**Symptom**：React 报 "Rendered fewer hooks than expected" 错误

**Cause**：`useSensors` / `useSensor` 在 `if (!sortable)` 的 early return **之后**调用。当 `sortable` 变化时 hook 调用顺序改变，违反 React Rules of Hooks

**Fix**：将所有 hooks（`useSensors`、`useSensor`）移到组件顶部、所有 early return 之前，无条件调用：

```tsx
// Correct — hooks 在最顶部，无条件调用
export function TaskList({ ..., sortable = true, ... }: Props) {
  const topTasks = tasks.filter((t) => !t.parentId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  if (topTasks.length === 0) {
    return <EmptyState />;  // early return 在 hooks 之后
  }
  // ...
}
```
