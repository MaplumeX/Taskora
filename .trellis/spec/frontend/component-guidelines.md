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
- Things3 配色：主色蓝 `primary`（HSL 218 45% 54% ≈ #4477CE），背景白/浅灰

---

## Common Mistakes

### 子任务在列表中重复显示

**Symptom**：子任务既出现在主列表中，又出现在父任务详情中

**Cause**：后端 `GET /tasks` 返回所有任务（含子任务），前端未过滤 `parentId`

**Fix**：在 `TaskList` 中过滤掉 `parentId != null` 的任务，子任务仅在父任务详情中呈现：

```tsx
const topLevelTasks = tasks.filter((t) => !t.parentId);
```

### TaskDetail 直接用列表数据导致子任务不刷新

**Symptom**：任务详情中"暂无子任务"常驻，新增子任务后不更新

**Cause**：`TaskDetail` 直接使用列表传入的 task 对象，该对象不含 children（`GET /tasks` 不 include children）

**Fix**：`TaskDetail` 内部用 `useTaskQuery(task.id)` 获取含 children 的实时数据，子任务操作后 invalidate 父任务 detail query。

---

## 标签徽章与多选

### 标签徽章（TaskItem）

- `TaskItem` 在标题右侧渲染小色块（`h-2.5 w-2.5 rounded-full`）表示标签，取自 `task.tags` 数组的 `color` 字段，最多展示 5 个，用 `title` attribute 提供标签名 tooltip。
- 徽章用 `style={{ backgroundColor: tag.color }}` 渲染内联色，不依赖 Tailwind 绐定。

### 标签多选行（TaskDetail）

- `TaskDetail` 新增"标签"行，采用可点击的标签 chip（pill）实现多选：当前选中为高亮（背景=标签色、字白），未选为淡化（opacity-40）。
- 点击 chip 调用 `useUpdateTask` 传 `tagIds` 全量数组（去重或移除该标签），符合后端 set 语义。
- 标签数据由 `useTagsQuery()` 获取（用户级），当前任务的标签由 `useTaskQuery(id).tags` 预选。
- 更新后 invalidate `tasks` 与 `task.detail` 两个 queryKey，确保列表徽章即时刷新。

---

## Accessibility

- 表单 Input 配 `<Label>`
- 按钮 有 `aria-label`（图标按钮）
- Dialog 用 shadcn/ui 的 Dialog 组件（内置 a11y）