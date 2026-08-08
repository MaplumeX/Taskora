# Component Guidelines

## Project heading layouts

Heading-aware task grouping is project-page-only. Keep aggregate task lists on
the generic `TaskListView`; `ProjectTaskLayout` owns the normalized project
shape:

```text
ungrouped task IDs
ordered heading IDs -> container-local task IDs
```

Use namespaced DnD identifiers (`heading:`, `task:`, and `container:`) so entity
IDs cannot collide. Empty heading containers remain droppable. Every completed
drag serializes and submits the full layout, and a failed save restores the
latest server-derived layout and shows the shared save-failed toast.

Heading rows are typographic section labels, not task rows: they have no
completion checkbox, use a dedicated drag handle, allow an empty inline title,
and require a destructive confirmation before deletion. The row's "⋯" menu
offers "Convert to Project" (before the delete item): it runs without a second
confirmation, disables while pending, and toasts `project:convertSuccess` /
`project:convertFailed` on settlement — no navigation to the new project.

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

**切换器**：设置 modal「外观」tab 内三选一 segmented control（light / dark / system）。`SunMedium`/`Moon`/`Monitor` 图标避开 Sidebar 已用于 Today 的 `Sun`。偏好即时生效（localStorage + DOM）+ 异步同步后端（`PUT /users/me/preferences`）。

---

## Common Mistakes

### 主题在 React 渲染后才应用导致 FOUC

**Symptom**：刷新页面时暗色用户先看到一帧浅色再变暗

**Cause**：在组件内 `useEffect` 才加 `.dark` class，此时首帧已绘制

**Fix**：在 `main.tsx` render 前同步调用 `applyThemeFromStorage()`（直接操作 `document.documentElement`），hook 只负责后续切换与监听。

### 展开行直接用列表数据导致子任务不刷新

**Symptom**：展开区中“暂无子任务”常驻，新增子任务后不更新

**Cause**：`TaskRowExpanded` 直接使用列表传入的 task 对象，该对象不含 subtasks（`GET /tasks` 不 include subtasks）

**Fix**：`TaskRowExpanded` 内部用 `useTaskQuery(task.id)` 获取含 subtasks 的实时数据，子任务操作后 invalidate 父任务 detail query。

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
  1.「计划日期」— `Calendar` 图标，弹出月历面板（`Calendar` 组件，基于 `react-day-picker`）+ 底部操作行（今天 / Someday / 清除），编辑 `scheduledDate` + `scheduledType`
  2.「到期」— `Clock` 图标，编辑 `dueDate`（仅 `<input type="date">`，无 scheduledType）
- 计划日期的 `scheduledType` 由用户在面板内的动作**派生**，不再以 segmented control 预先声明：
  - 点日历某天 → `{ scheduledType: DATE, scheduledDate }`（选中日期高亮，点选后面板保持打开可继续微调）
  - 点「今天」→ `{ scheduledType: DATE, scheduledDate: 今天 }`
  - 点「Someday」→ `{ scheduledType: SOMEDAY }`（Someday 按钮在当前为 SOMEDAY 时高亮 `variant="secondary"`）
  - 点「清除」→ `{ scheduledType: NONE, scheduledDate: null }`（NONE 时清除按钮 disabled）
  - `scheduledType === SOMEDAY` 或 `NONE` 时日历无选中日期
- `Calendar` 组件（`src/components/ui/calendar.tsx`）基于 `react-day-picker` 的 `DayPicker`（`mode="single"`），`classNames` 走 CSS 变量（`primary`/`primary-foreground`/`accent`/`muted-foreground`/`ring`），light/dark 均正确。选中态 `bg-primary text-primary-foreground` 圆形填充；今日底部圆点标记（`after:bg-primary`），不与选中态冲突
- `Calendar` 的 `locale` prop 由 `ScheduledDateField` 按 `i18n.language` 解析后传入（`zh-CN` / `en-US`），组件本身不依赖 i18next
- 两者都复用 `IconPopover` 组件（计划日期 Popover 内容替换为 `ScheduledDateField`，到期仍为 `DueDateField`）
- 更新走 `useUpdateTask`，成功后 invalidate `task.detail` 与 `['tasks']` 两个 queryKey

### 标签多选（TaskRowExpanded 内的 Popover 菜单）

- 任务展开区（`TaskRowExpanded`）的标签图标点击后弹出 Popover 菜单，内含可多选的标签列表：当前选中为高亮（背景=标签色、字白），未选为淡化（opacity-40）。
- 点击标签项调用 `useUpdateTask` 传 `tagIds` 全量数组（去重或移除该标签），符合后端 set 语义。
- 标签数据由 `useTagsQuery()` 获取（用户级），当前任务的标签由 `useTaskQuery(id).tags` 预选。
- 更新后 invalidate `tasks` 与 `task.detail` 两个 queryKey，确保列表徽章即时刷新。

### 右键菜单（TaskContextMenu）

任务主任务行（`TaskItem`）支持原生右键菜单，无需展开行即可完成常见操作。组件位于 `src/components/task/TaskContextMenu.tsx`。

- **触发与定位**：在包裹行头的容器 div 上挂 `onContextMenu`，`e.preventDefault()` 阻止浏览器默认菜单，记录鼠标坐标并通过 `@radix-ui/react-popover` 的 `PopoverAnchor` + 虚拟 ref（`React.RefObject<Measurable|null>`，在 `onContextMenu` 时赋值 `.current`）定位到鼠标坐标。**不新增可见触发按钮**。使用已安装的 `react-popover` 虚拟锚点即可，不引入 `@radix-ui/react-context-menu`（交互复杂度未到需要原生 submenu 的程度）。
- **作用范围**：仅包裹 `TaskItem` 的主任务行（checkbox + 标题 + badges），**不**包裹展开区 `TaskRowExpanded`。否则展开态下右键输入框会丢失浏览器原生右键（粘贴/拼写检查等）。展开区位于 `</TaskContextMenu>` 之外，作为 `data-task-item` 根 div 的直接子节点。
- **菜单项**（按序）：标记完成/未完成（文案随 `current.status` 切换，调 `useCompleteTask`/`useUncompleteTask`）、设置计划时间、设置到期时间、设置标签、末项（删除/恢复，随 `variant` 切换，见下）。
- **变体（`variant`）**：prop `variant?: 'default' | 'trash'`，默认 `default`。两者菜单结构与 picker 逻辑完全相同，仅末项语义不同：`default` 末项为「删除」（`handleDelete` → `useDeleteTask`，文案 `common:delete`，失败 toast 用 `task:deleteFailed`）；`trash` 末项为「恢复」（`handleRestore` → `useRestoreTask`，文案 `common:restore`，失败 toast 用 `common:restoreFailed`）。`default` 行为是回归保护基线，改动时不得影响。
- **废纸篓复用**：`Trash.tsx` 的行用 `<TaskContextMenu task={task} current={task} variant="trash">` 包裹以获得右键菜单；恢复入口仅走右键菜单，行尾不再有内联恢复按钮（与普通任务行「删除仅走右键」一致）。废纸篓行保持简单行（无展开/无 `onRowClick`）。
- **日期/标签子交互**：点击对应菜单项 → 关闭主菜单 + `setActivePicker(kind)` → 用第二个受控 `Popover`（锚定到行容器 ref）渲染对应 Field picker。
- **键盘**：主菜单打开 autoFocus 首项、Esc 关闭、Tab + Enter 触发（方向键 roving 导航未实现，列为 Deferred）。

### 共享菜单行组件（MenuRow）

`src/components/common/MenuRow.tsx` 是 Popover 手写菜单（`TaskContextMenu` / `ProjectMenuPanel` / `AreaMoreMenu`）共用的菜单行组件，消除此前三处各自定义的 `MENU_ITEM_CLASS` 常量。

- **结构**：`React.forwardRef` 包装 `<button>`，props `{ icon: LucideIcon; destructive?: boolean; onClick; children }`。布局 `flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm`，图标 `h-4 w-4 shrink-0` 跟随 `currentColor`。
- **dangerous variant**：`destructive` 为 true 时静态 `text-destructive` + hover `hover:bg-destructive/10 hover:text-destructive`；否则 `hover:bg-accent hover:text-accent-foreground`。
- **ref 转发**：首项需要 autoFocus 的场景（`TaskContextMenu` / `ProjectMenuPanel`）通过 `ref={firstItemRef}` 传入。
- **菜单项图标映射**（统一约定，勿混用）：完成 `Check` / 未完成 `Circle`、计划日期 `CalendarClock`、到期 `CalendarDays`、标签 `Tag`、转为项目 `FolderInput`、删除 `Trash2`、恢复 `RotateCcw`。
- **分组分隔线**：语义分组间用 `<div className="-mx-1 my-1 h-px bg-muted" />`。分组规则：`[完成]` / `[日期+标签]` / `[转为项目]`（仅 default）/ `[删除/恢复]`。`AreaMoreMenu` 只有 `[标签]` / `[删除]` 两组。
- **DropdownMenuItem 的危险项**：不使用 `MenuRow`，但在 className 上补 `focus:bg-destructive/10 focus:text-destructive`（见 `ProjectHeadingRow` 删除 heading 项）。
- **SidebarBottomBar 设置按钮**：齿轮按钮点击后调 `uiInteractionStore.openSettings('appearance')` 弹出设置 modal（不再 `navigate('/settings/appearance')`）。新增菜单项用 `FolderPlus`（新项目）/ `Layers`（新区域）图标。

### 右键菜单（ProjectContextMenu / ProjectMoreMenu）

项目条目（`ProjectItem` / `ProjectFeedRow`）支持与 `TaskContextMenu` 对齐的右键上下文菜单，组件位于 `src/components/project/ProjectContextMenu.tsx`。

- **结构镜像 TaskContextMenu**：右键虚拟锚点 + 主菜单 `Popover` + picker 二级 `Popover`（锚定行容器 ref）。菜单项（按序）：标记完成/未完成（`useCompleteProject`/`useUncompleteProject`）、日期、到期、标签、末项（删除/恢复，随 `variant` 切换）。
- **变体（`variant`）**：`'default' | 'trash'`，默认 `default`。`default` 末项「删除」→ `useDeleteProject`（`text-destructive`）；`trash` 末项「恢复」→ `useRestoreProject`。`ProjectFeedRow` 按 `item.trashedAt !== null` 切换 variant。
- **共享菜单面板**：内部 `ProjectMenuPanel` 同时渲染菜单项 + picker，被右键版 `ProjectContextMenu` 与 trigger 版 `ProjectMoreMenu` 共用，避免重复实现。`ProjectMoreMenu` 内置 `MoreHorizontal` ghost 按钮作为 `PopoverTrigger`，用于详情页标题旁的「更多」入口。
- **dnd-kit 兼容**：`SortableProjectItem`（侧边栏 + AreaDetail）的 `useSortable` listeners 在外层 div，`ProjectContextMenu` 的 `onContextMenu` 在内层容器，互不干扰（拖拽靠 PointerSensor distance:5，右键不参与 pointer 判定）。
- **字段组件复用**：picker 复用 `task/fields/` 下的 `ScheduledDateField`/`DueDateField`/`TagsField`，props 期望 `TaskResponseDto`/`UpdateTaskDto`，项目字段名对齐，沿用 cast 兼容（`current as unknown as ...`、`patch as any`，与 `ProjectDetail` 原有模式一致）。
- **i18n**：菜单文案复用 `task:` 命名空间（`markComplete`/`markIncomplete`/`scheduledDate`/`dueDate`/`tags`）与 `common:`（`delete`/`restore`/`saveFailed`/`more`）。「更多」按钮 aria-label 用 `common:more`。

### 共享 Field 组件（task/fields/）

`TaskRowExpanded` 与右键菜单共用的编辑字段已抽取为 `src/components/task/fields/` 下独立组件：`ScheduledDateField` / `DueDateField` / `TagsField`。统一 props：`{ current: TaskResponseDto; onPatch: (data: UpdateTaskDto) => void }`。父组件负责定义 `patch`（调 `useUpdateTask` + invalidate `task.detail` + `['tasks']` + toast），Field 仅负责 UI 与调用 `onPatch`，不重复 mutation/invalidation 逻辑。`IconPopover`（`TaskRowExpanded` 内）作为 trigger 容器保留，仅 children 替换为对应 Field。

---

### 展开编辑态纵向布局（TaskRowExpanded）

展开区根 `<div>` 使用 paper 容器样式：`rounded-xl border border-border/50 bg-card px-3 py-2.5 shadow-sm`，视觉上从列表行中浮起为独立卡片。外层 `TaskItem` 展开态保留 `bg-muted/60` 作为画布衬托。

展开区从上到下依次为：

1. **标题** — 无边框 Input（`border-0 px-0 py-0 shadow-none focus-visible:ring-0`），onBlur commit。标题/备注采用扁平无边框样式以体现"一体"的编辑体验，不画 Input 边界。
2. **备注** — 无边框 Textarea（同上 className 约定），onBlur commit。
3. **子任务区** — 按需渲染（见下「子任务区按需渲染」）。
4. **图标按钮行** — 5 个 `IconPopover`（日期 / 到期 / 项目 / 区域 / 标签）+ 仅在无子任务时出现的 `Add subtask` 按钮（`ListPlus`），左对齐。

**不放在展开区内**：标记完成按钮（折叠态行勾选框已提供）。展开态仅做编辑，完成交给折叠态行。

> 删除按钮位于展开态行内（`TaskRowExpanded` 图标行的 `Trash2` 按钮），不在折叠态行。此前折叠态行曾有 hover 删除按钮，已于 2025-07 移除（commit `c69f243`），避免与拖拽手柄冲突。

---

## 备注 Markdown WYSIWYG 编辑器（MarkdownNotesEditor）

任务备注（`TaskRowExpanded`）与项目备注（`ProjectDetail`）使用可复用组件 `src/components/common/MarkdownNotesEditor.tsx`，基于 Tiptap v3 实现所见即所得编辑。后端 `notes` 字段仍存 Markdown 字符串，后端零改动。

### 选型与依赖

- `@tiptap/react`（MIT）— React 封装，`useEditor` + `EditorContent`
- `@tiptap/starter-kit`（MIT）— 基础节点集合（标题/列表/引用/代码块/分隔线/链接等），v3 已内置 Link 扩展
- `@tiptap/markdown`（MIT，官方）— Markdown 双向解析/序列化，通过 module augmentation 给 `Editor` 添加 `getMarkdown()` 方法、给 `EditorOptions` 添加 `contentType: 'markdown'` 选项
- `@tailwindcss/typography`（MIT）— `.prose` 排版样式

不选 Lexical 的原因：Tiptap 的 React API 更直观，Markdown 双向转换有官方扩展，对备注这种轻量场景上手成本更低。

### 组件契约

```tsx
interface MarkdownNotesEditorProps {
  value: string;            // Markdown 字符串
  onChange: (md: string) => void;   // 内容变化回调（同步本地 state）
  onBlurCommit: () => void;        // 失焦提交回调（保留失焦提交语义）
  placeholder?: string;
}
```

### 数据流

```
Markdown 字符串 (props.value)
  → useEditor({ content: value, contentType: 'markdown' })  [挂载]
  → ProseMirror 内部文档 (所见即所得编辑)
  → onUpdate → editor.getMarkdown() → onChange(md)  [本地 state 同步]
  → onBlur → onBlurCommit() → patch({ notes: md })  [失焦保存]
```

### 外部 value 同步（防循环更新）

`useEditor` 在初始化时绑定 `content`，后续外部 `value` 变化（如 server refresh）需用 `useEffect` 监听并调 `editor.commands.setContent(value, { contentType: 'markdown' })`。`setContent` 会触发 `onUpdate`，需用 ref（`skipNextUpdate`）跳过该次 `onChange`，否则会 echo 回父组件形成循环。仅在 `value !== editor.getMarkdown()` 时才 `setContent`，避免编辑中 caret 被 clobber。

### Placeholder 实现

Tiptap 空文档渲染 `.ProseMirror > <p><br class="ProseMirror-trailingBreak"></p>`，wrapper 永远非 `:empty`，不能用 CSS `:empty` 伪类。

方案：用 `useEditorState` 跟踪 `editor.isEmpty`，在 wrapper 上设 `data-empty="true|false"`；`data-placeholder` 通过 `editorProps.attributes` 直接挂在 `.ProseMirror` 元素上（不是 React wrapper div），CSS `attr()` 读取伪元素宿主的属性。CSS：

```css
.notes-prose[data-empty="true"] .ProseMirror::before {
  content: attr(data-placeholder);
  color: hsl(var(--muted-foreground));
  pointer-events: none;
  float: left;
  height: 0;
}
```

placeholder prop 变化时（如 i18n 语言切换）用 `editor.setOptions({ editorProps })` 重新应用。

### 样式约定

- 外层 `className="prose prose-sm dark:prose-invert notes-prose min-h-[60px] resize-none border-0 px-0 shadow-none focus-visible:ring-0"`，沿用无边框内嵌文本风格。
- `.notes-prose` 自定义类用 CSS 变量覆盖 typography 插件的灰色系默认值（`--tw-prose-body` / `--tw-prose-headings` / `--tw-prose-links` 等映射到 `--foreground` / `--primary` / `--border` / `--muted-foreground`）。
- `.ProseMirror:focus { outline: none }` 去掉默认 focus outline。

---

### Common Mistake: Tiptap 编辑器键盘 stopPropagation 用 capture 阶段阻断 ProseMirror 输入

**Symptom**：Tiptap 编辑器中按 Enter 不换行，按 Space 不输入空格，编辑器无法正常输入。

**Cause**：在 `EditorContent` 的 wrapper div 上用 `onKeyDownCapture`（capture 阶段）`stopPropagation`。ProseMirror 在 `.ProseMirror` contenteditable 上注册的 native `addEventListener('keydown', …)` 在 at-target / bubble 阶段触发。capture 阶段 `stopPropagation` 会阻止事件下传到 `.ProseMirror` 目标元素，ProseMirror 的 keymap（如 Enter → splitBlock）永远收不到事件。

**Fix**：改用 `onKeyDown`（bubble 阶段）`stopPropagation`。让 ProseMirror 先在 at-target 处理完 keymap（插入段落/空格），事件冒泡到 wrapper 时再 `stopPropagation` 阻断外层 sortable 的 dnd-kit `onKeyDown` listener。Enter/Space 仍被阻止冒泡到 dnd-kit KeyboardSensor，Escape 仍放行触发行折叠——与原 Textarea 的 `onKeyDown` pattern 对齐。

```tsx
// ✅ Correct — bubble phase, ProseMirror processes keymap first
<EditorContent
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation();
    }
    // Escape 不 stopPropagation，让事件冒泡到 TaskItem 触发折叠
  }}
/>

// ❌ Wrong — capture phase blocks ProseMirror keymap
<EditorContent
  onKeyDownCapture={(e) => {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  }}
/>
```

---

## 子任务区按需渲染（TaskRowExpanded）

子任务区（`Separator` + 子任务标题 + 列表 + 添加子任务 Input）**默认不渲染**，由本地状态 `subtasksOpen`（初始值 = `subtasks.length > 0`）控制可见性：

- **无子任务时**：整个子任务区块不渲染（无标题、无空状态文本、无输入框）。图标按钮行末尾的 `Add subtask` 按钮（`ListPlus` 图标，ghost/size icon，`text-muted-foreground`）仅在此时渲染；点击后置 `subtasksOpen=true` 并通过 `requestAnimationFrame` 聚焦添加子任务 Input。移除了原先的 `task:noSubtasks` 空状态文本。
- **有子任务时**：展开即默认渲染子任务区块（`subtasksOpen` 初值 true）。标题显示 `Subtasks (n)`（`t('task:subtasks')` + 计数），列表与添加 Input 照常。底部图标栏**不再渲染** `Add subtask` 按钮——子任务区块已默认展开，区块内的添加 Input 即是继续添加的入口。
- `Add subtask` 按钮不再承担折叠/收起子任务区块的职责（已移除 `toggleSubtasksOpen`，改为仅展开的 `openSubtasks`）；它只是“创建第一个子任务”的入口。
- 添加首个子任务后区块保持可见（`addSubtask` 不修改 `subtasksOpen`），此后该按钮也不再出现。

## 行内展开交互模式（Things 3 风格）

任务编辑采用列表行内展开，不使用弹窗 Dialog。交互状态机：

- `idle`（未选中）→ 单击行 → `selected`（高亮）
- `selected` → 单击同一行 → `expanded`（原位展开编辑区 `TaskRowExpanded`）
- `expanded` → 单击同一行 → 回到 `selected`（折叠）
- 单击他行 → 当前行折叠并取消，他行变 `selected`
- 点击列表空白 → 全部回到 `idle`

**状态归属**：`selectedId` 为列表级瞬态用 `useState`（在 `TaskListView` / `Logbook` 中）；`expandedId` 存于 `uiInteractionStore`（Zustand，非持久），以便跨组件（如底部共享栏创建任务后）能驱动某行展开。均抽成 `useTaskRowSelection()` hook 复用，hook 内部委托 store，消费方零改动。刷新后展开态丢失（可接受，属瞬态）。

**事件隔离（关键）**：展开区内的交互不能冒泡到外层空白点击 handler 与 sortable listeners，否则会误折叠或误触发拖拽：

- 展开区根 div：`onClick={e => e.stopPropagation()}`
- `PopoverContent`：`onClick` 需 `stopPropagation`（Radix Popover 通过 Portal 渲染，事件仍会冒泡到 document）
- 子任务编辑 input：`onClick` 需 `stopPropagation`
- checkbox：已有 `stopPropagation`，不参与状态机
- **可编辑控件（Input/Textarea/Tiptap EditorContent）的 `onKeyDown`**：对 `Enter` / `Space` 必须 `e.stopPropagation()`。`SortableTask` / `SortableTaskItem` 把 `{...attributes} {...listeners}` 铺在整行外层 div 上，而 dnd-kit 的 `KeyboardSensor` 默认把 Enter/Space 当作"开始拖拽"按键。若不阻断，在子任务 Input 按 Enter 提交、或在备注 Textarea 按 Enter 换行时，keydown 会冒泡到 listeners 启动键盘拖拽；单元素 `SortableContext` 无可换位落点，`isDragging` 卡在 `true`、行半透明不恢复，且 Space 会被 KeyboardSensor `preventDefault` 吞掉导致空格字符丢失。Escape **不** stopPropagation，让事件冒泡到 `TaskItem` 根 div 的 `onKeyDown` 触发折叠。备注 WYSIWYG 编辑器（`MarkdownNotesEditor`）的 `onKeyDown` 必须用 **bubble 阶段**（非 capture），否则会阻断 ProseMirror 自身的 keymap 处理（见「备注 Markdown WYSIWYG 编辑器」小节的 Common Mistake）。

## Accessibility

- 表单 Input 配 `<Label>`
- 按钮 有 `aria-label`（图标按钮）
- 图标小菜单用 shadcn/ui 的 Popover 组件（基于 Radix Popover）

---

## 详情页标题内联编辑（InlineTitleEdit 模式）

项目 / 区域详情页的标题采用点击即编辑的内联模式（不弹 Dialog），组件位于 `src/components/common/InlineTitleEdit.tsx`。

### 交互状态机

- `display` 态：`<h1>` 级文本（保留 `text-2xl font-semibold tracking-tight`），点击进入 `edit` 态。
- `edit` 态：扁平无边框 `<input>`（`border-0 px-0 py-0 shadow-none focus-visible:ring-0 bg-transparent`），与 `TaskRowExpanded` 标题输入框风格一致。
- `Enter` / 失焦 → 提交；`Escape` → 取消。
- 提交规则：与原值相同（`trim()` 后比较）→ 仅退出编辑态不调 `onSubmit`；否则调 `onSubmit(next)` 并乐观退出编辑态（不等 mutation）。空标题允许提交，`onSubmit('')` 后 display 态回退到 `placeholder`。

### 新建后自动进入编辑态

从侧边栏底栏「新增」菜单创建空标题条目 → 调 `uiInteractionStore.setPendingAutoEditId(created.id)` 后 `navigate` 到详情页 → 详情页读 `pendingAutoEditId === routeId` → 传 `autoFocusAndSelect` 给 `InlineTitleEdit`，并在 mount 后 `clearPendingAutoEditId()` 消费即清。store 内存态非持久，刷新后 `pendingAutoEditId` 为 null，不会重复触发编辑。

`autoFocusAndSelect` 仅在 `value` 非空时调 `select()`（空标题场景无意义）。

### 标题内联编辑为唯一入口

内联编辑仅覆盖标题字段。详情页不再提供「编辑」/「删除」**文案按钮**——标题由 `InlineTitleEdit` 直接编辑。项目详情页（`ProjectDetail`）在标题行右侧提供「更多」按钮（`ProjectMoreMenu`，`MoreHorizontal` 图标），弹出内容与项目右键菜单一致（完成切换 / 日期 / 到期 / 标签 / 删除）；区域详情页（`AreaDetail`）同样在标题行右侧提供「更多」按钮（`AreaMoreMenu`，位于 `src/components/area/AreaMoreMenu.tsx`），菜单仅含「标签」与「删除」两项（区域无完成/日期概念）：标签项打开 `TagsField` picker（popover 二级面板，与 Project 一致），删除项调 `useDeleteArea` 并成功后 `navigate('/today')`。区域标签能力由后端 `AreaTag` join 表支持（与 `ProjectTag` 对称，`tagIds` 全量 set 语义）。项目/区域的 list 管理页已移除，`ProjectForm` / `AreaForm` 对话框已删除。

---

## 侧边栏底栏（SidebarBottomBar）

`src/components/layout/SidebarBottomBar.tsx` 抽离自 `Sidebar.tsx`，布局左右两端：

- **左：新增按钮**（`Plus` + `common:add`）→ `DropdownMenu` 含 `common:newProject` / `common:newArea`。点击直接 `createProject.mutate({ title: '' })` / `createArea.mutate({ title: '' })`（后端 `@IsString()` 允许空串），成功后 `uiInteractionStore.setPendingAutoEditId(created.id)` 再 `navigate` 跳转详情页。`isPending` 时禁用菜单项防重复提交。
- **右：设置按钮**（齿轮 `Settings`，icon-only + `aria-label`）→ 点击后调 `uiInteractionStore.openSettings('appearance')` 弹出设置 modal。主题 / 语言切换在 modal「外观」tab 内，不再通过 DropdownMenu。

---

## 内容底栏（ContentBottomBar）

`src/components/layout/ContentBottomBar.tsx` 是页面底部共享栏，跨任务视图复用：

- **搜索按钮**（`Search` 图标，`aria-label`）→ 打开 `SearchModal`（`Cmd/Ctrl+K` 快捷键全局监听），始终显示。
- **添加项目按钮**（`FolderPlus` 图标，`aria-label` `project:addProject`）→ 仅在 `/areas/:id`（且该 area 存在）时显示。`createProject.mutate({ title: '', areaId })`（`areaId` 取当前路由 id，与 `SidebarBottomBar.handleNewProject` 的差异仅在于携带 `areaId`）。成功后 `uiInteractionStore.setPendingAutoEditId(p.id)` + `navigate('/projects/{id}')`，失败 toast `common:createFailed`，`isPending` 时 disabled。
- **添加任务按钮**（`Plus` 图标，`aria-label`）→ `createTask.mutate({ title: '', ...ctx })`（空标题创建，与项目/区域一致的空标题模式），`ctx` 来自 `usePageTaskContext()`（根据当前路由推断 `CreateTaskDto` 上下文字段：`scheduledType` / `scheduledDate` / `bucket` / `projectId` / `areaId` / `tagIds`）。成功后 `uiInteractionStore.setExpandedId(created.id)` 驱动该行展开。

### 按钮显隐控制

添加任务按钮并非所有页面都显示。`ContentBottomBar` 内部用 `useLocation()` 做精确路由匹配，在语义上不应添加任务的页面隐藏按钮（搜索按钮始终保留）：

- `/upcoming`：未来日期列表，添加任务需要额外的默认日期决策，暂不支持直接添加
- `/logbook`：已完成任务归档
- `/trash`：已删除任务

用 `HIDE_ADD_TASK_ROUTES` 常量数组 + `pathname` 精确匹配 `includes` 判断（非 `startsWith`，避免误隐藏子路由）。

添加项目按钮的显隐用 `pathname.startsWith('/areas/')` + `useParams().id` + `useAreasQuery()` 校验 area 存在性三重判断（仅区域详情页显示，`startsWith` 在此场景合理因为 `/areas/` 前缀路由只有 `/areas/:id`）。

### `usePageTaskContext` 路由→上下文映射

`src/lib/hooks/usePageTaskContext.ts` 返回 `Omit<Partial<CreateTaskDto>, 'title'>`（`title` 始终由 `ContentBottomBar` 设为 `''`，页面上下文不应覆盖）。路由与上下文的映射关系：

| 路由 | 返回上下文 | 落入 bucket（后端 `resolveBucket`） |
|---|---|---|
| `/today` | `{ scheduledType: DATE, scheduledDate: today }` | SCHEDULED |
| `/someday` | `{ scheduledType: SOMEDAY }` | SCHEDULED |
| `/anytime` | `{ bucket: ANYTIME }` | ANYTIME（前端显式传） |
| `/projects/:id` | `{ projectId }` | ANYTIME（resolveBucket 推导） |
| `/areas/:id` | `{ areaId }` | ANYTIME（resolveBucket 推导） |
| `/tags/:tagId` | `{ tagIds: [tagId] }` | INBOX（默认兜底） |
| 其他（`/inbox` 等） | `{}` | INBOX（默认兜底） |

**关键**：`/anytime` 必须前端显式传 `bucket: TaskBucket.ANYTIME`，因为 `resolveBucket` 在 `scheduledType=NONE` 且无显式 bucket / projectId / areaId 时默认落 INBOX。

---

## 空标题占位符约定

新建任务/项目/区域统一用 `title: ''` 创建，不持久化占位词作为实际标题。标题为空时 UI 显示占位符（`text-muted-foreground` 淡化），进入编辑态时输入框 value 仍为空串。

### 展示规则

- **列表项**（`TaskItem` 折叠态 / `ProjectItem` / 侧边栏 `SidebarAreaRow` 与 `SidebarProjectSection` 子项）：`{item.title || t('xxx:newItemPlaceholder')}`，空标题时 className 用 `text-muted-foreground`，有标题时 `text-foreground`。侧边栏 tag 子项用 `tag:new`（「新标签」/「New Tag`）。
- **详情页标题**（`InlineTitleEdit`）：已有 `{value || placeholder}` 展示逻辑，placeholder 传 `t('xxx:newItemPlaceholder')`。
- **展开态 Input**（`TaskItem` 展开态）：`value` 始终为实际存储值，`placeholder={t('task:newTaskPlaceholder')}`。

### i18n key 约定

- 列表/详情页占位符用「新建XX」语义：`task:newTaskPlaceholder`（新建任务）、`project:newItemPlaceholder`（新建项目）、`area:newItemPlaceholder`（新建区域）。
- 对话框表单 Input 的 placeholder 用「XX名称」语义（`titlePlaceholder`），两者不混用。

### 刚创建自动聚焦判定

检测「刚创建需自动聚焦标题输入框」用 `title === ''`（空值判定），**不要**用 `title === t('xxx:占位词')`（字符串匹配）——后者依赖 i18n 文案，语言切换或文案改动会破坏判定。

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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  if (tasks.length === 0) {
    return <EmptyState />;
  }
  // ...
}
```

### Common Mistake: 展开态输入框按 Enter/Space 卡在拖拽态

**Symptom**：任务行只有一个任务时，展开该任务 → 在子任务 Input 输入文字并按 Enter 提交后，行变半透明（`opacity: 0.45`）且不恢复；Space 也可能被吞掉导致空格字符无法输入。

**Cause**：`SortableTask` / `SortableTaskItem` 把 `{...attributes} {...listeners}` 铺在整行外层 div 上，展开态的 `TaskRowExpanded` 内部所有可编辑控件都落在这个 listeners 区域内。dnd-kit 的 `KeyboardSensor` 默认把 **Enter / Space** 当作"开始拖拽"按键。用户在输入框按 Enter 时，keydown 冒泡到外层 div 的 `onKeyDown`（listeners）→ KeyboardSensor 启动拖拽 → `isDragging=true`；单元素 `SortableContext` 无可换位落点，键盘拖拽无法自然结束，卡在拖拽态。修复前只对 `onClick` 做了 `stopPropagation`，漏了 `onKeyDown`。

**Fix**：在展开态所有可编辑控件（标题 Input、备注 Textarea、子任务 Input、SubtaskRow 内联编辑 Input）的 `onKeyDown` 里，对 `Enter` / `Space` `e.stopPropagation()`，阻止冒泡到 sortable listeners。**Escape 不 stopPropagation**，让事件冒泡到 `TaskItem` 根 div 的 `onKeyDown` 触发折叠。回归测试见 `src/components/task/TaskRowExpanded.test.tsx`。

```tsx
onKeyDown={(e) => {
  if (e.key === 'Enter') {
    e.stopPropagation();
    // ...原逻辑（blur / addSubtask 等）
  } else if (e.key === ' ') {
    e.stopPropagation();
  } else if (e.key === 'Escape') {
    // 不 stopPropagation；让事件冒泡到根 div 触发折叠
    // ...原 Escape 逻辑
  }
}}
```

---

## 侧边栏项目可见性过滤（Sidebar）

侧边栏项目列表仅展示 `ACTIVE` 项目，`COMPLETED` 项目不参与导航树。过滤发生在 `Sidebar.tsx` 顶层：将 `useProjectsQuery()` 返回值就过滤 `status !== ProjectStatus.COMPLETED` 后再传给 `SidebarProjectSection`。这是纯展示层过滤——后端 `ProjectsService.findAll` 仍返回所有 `status` 的项目（其它视图如详情页 / feed 可能需要已完成项目）。拖拽排序对子集安全：后端 `reorder` 只更新传入 id 的 `sortOrder`，`SidebarProjectSection` 收到的就是可见子集。

## 侧边栏拖拽（SidebarProjectSection）

侧边栏的项目/区域拖拽与任务列表拖拽不同：一个 `DndContext` 管理三种拖拽语义（区域间排序、同区域项目排序、跨区域移动项目）。组件位于 `src/components/layout/SidebarProjectSection.tsx`。

### 合并 Section 结构

侧边栏不再分「独立项目」与「区域」两个独立列表，而是合并为一个 section：顶部列出无区域归属的项目，下方每个区域作为可折叠条目（含该区域项目列表）。外层 `DndContext` 统一处理所有拖拽。

### ID 前缀区分类型

同一 `DndContext` 内区域和项目混排，用前缀区分 sortable id：

```typescript
const PROJ_PREFIX = 'proj:';
const AREA_PREFIX = 'area:';
// useSortable({ id: `${PROJ_PREFIX}${project.id}` })
// useSortable({ id: `${AREA_PREFIX}${area.id}` })
```

`handleDragEnd` 根据 `active.id` / `over.id` 的前缀分支：

1. **区域间排序**（active & over 都是 area）：`arrayMove` 区域顺序 → `reorderAreas.mutate`。
2. **跨区域移动项目**（项目 active，目标 areaId 与当前不同）：先 `updateProject.mutate({ id, data: { areaId: targetAreaId } })`，`onSettled` 后再 `reorderProjects.mutate(newOrderedIds)` 持久化新顺序。
3. **同列表排序**（项目 active，目标 areaId 与当前相同）：`computeReorderedGlobalIds` 计算全量 orderedIds → `reorderProjects.mutate`。

### 跨区域移动的两步提交

跨区域移动必须先改 `areaId` 再重排，不能用单个 reorder 端点。因为后端 `reorder` 只写 `sortOrder`，不改 `areaId`。两步用 `onSettled` 串联，失败时 `toast.error`。

### 落到区域标题的插入策略

当 `over.id` 是区域前缀但不是项目（即拖到区域标题）时，项目插入到目标区域分组的末尾，而非区域第一个项目之前。`computeReorderedGlobalIds` 用 `overProjectId === null` 分支处理。

### Sortable 包装层

与 `TaskItem` 一样，不修改展示组件（`SidebarAreaRow` / `ProjectItem`），在其上包一层 `SortableAreaRow` / `SortableProjectItem`。`listeners` 挂在外层 div 上，保留内层 `NavLink` 导航与 chevron 折叠行为。

## 项目进度环形复选框（ProjectProgressRing）

项目条目（`ProjectItem` / `ProjectFeedRow`）前缀用环形进度复选框替代文件夹图标，既展示项目内任务完成比例，又可点击完成/恢复整个项目。组件位于 `src/components/project/ProjectProgressRing.tsx`。

### Props 与状态判定

```tsx
interface Props {
  total: number;              // project.taskTotalCount
  completed: number;          // project.taskCompletedCount
  projectStatus: ProjectStatus;
  onToggle: () => void;       // 完成/恢复项目
  disabled?: boolean;
}
```

区分两个概念：`isChecked = projectStatus === COMPLETED`（实心圆 + 勾）；满环 = `total > 0 && completed === total`（进度弧满圈，无实心、无勾）。两者独立——全部任务完成但项目未标记完成时只显示满环，不显示勾。

### SVG 环形结构

尺寸 18×18（与 `TaskCheckbox` 一致），r=7，strokeWidth=2。用 `strokeDasharray` / `strokeDashoffset` 实现进度环：

```tsx
const CIRCUMFERENCE = 2 * Math.PI * 7;  // ≈ 43.98
const offset = CIRCUMFERENCE * (1 - ratio);
// 轨道圆（isChecked 时 text-primary，否则 muted），进度圆（primary，rotate(-90) 从顶部起始）
// isChecked 时：实心 circle + SVG path 画勾（text-primary-foreground）
```

视觉状态矩阵：

| 项目 status | 任务完成 | 轨道 | 进度弧 | 实心圆 | 勾 |
|---|---|---|---|---|---|
| ACTIVE | 0 | muted | 无 | 无 | 无 |
| ACTIVE | 部分 | muted | primary 填充 | 无 | 无 |
| ACTIVE | 全部 | muted | 满圈(offset=0) | 无 | 无 |
| COMPLETED | 任意 | primary | 无 | primary | 白色 |

`aria-checked` 用 `isChecked`（项目完成状态），而非满环状态。

### 点击与导航隔离

`button` 包裹 SVG，`onClick` 先 `e.stopPropagation()` 再调 `onToggle()`——与 `TaskCheckbox` 模式一致，避免点击环形触发外层导航。点击条目其他区域（标题等）仍导航到项目详情。

### 使用方

- `ProjectItem`（侧边栏 / Area 详情）：`onToggle` 调 `useCompleteProject` / `useUncompleteProject`，已完成态补 `line-through text-muted-foreground`
- `ProjectFeedRow`（聚合 feed 视图）：同上，`item.status as ProjectStatus` cast 安全（`TaskStatus` 与 `ProjectStatus` 枚举值一致）
- `ProjectDetail`（项目详情页标题左侧）：`onToggle` 调 `useCompleteProject` / `useUncompleteProject`，复用 complete/uncomplete mutation

### 与 TaskCheckbox 的差异

`TaskCheckbox` 是纯二态勾选框（checked/unchecked）。`ProjectProgressRing` 在二态基础上增加进度环可视化，但点击语义相同（toggle 完成）。两者尺寸一致（18×18），共享 `active:scale-90` 动画与 stopPropagation 模式。

## 已完成任务归档区（ProjectCompletedTasks）

项目详情页底部有一个可折叠的已完成任务区域，组件位于 `src/components/project/ProjectCompletedTasks.tsx`，由 `ProjectDetail` 在 `ProjectTaskLayout` 下方渲染。

### 数据获取与过滤

- 独立调用 `useTasksQuery({ projectId, completed: true })`，与活跃任务的 `useTasksQuery({ projectId })` 缓存隔离（不同 queryKey）
- 后端 `completed=true` 返回 ACTIVE + COMPLETED 混合，前端需过滤 `status === COMPLETED && trashedAt === null`
- 过滤后按 `completedAt` 降序（最近完成在前），`completedAt` 为 null 时 `?? 0` 防御
- `useCompleteTask` / `useUncompleteTask` 的 `onSettled` 已 `invalidateQueries({ queryKey: taskKeys.all })`（前缀 `['tasks']`），会自动刷新此 query，无需额外 invalidate

### 折叠/展开与持久化

- 展开偏好按 `projectId` 存储在 `useProjectUiPrefsStore`（Zustand + `persist`，localStorage key `taskora-project-ui-prefs`），每个项目独立记忆
- 默认收起（`completedPanelExpanded[projectId] ?? false`）
- 折叠条头：`ChevronRight` 图标（展开时 `rotate-90`）+ `project:completed` 文案 + 计数

### 任务行复用

- 复用 `TaskItem`（折叠态），传 `onToggleComplete` 调 `useUncompleteTask`，**不传 `onRowClick`**（不进入 selected/expanded 态）
- `TaskItem` 内置 `TaskContextMenu`，归档区行因此也有右键菜单——这是复用 `TaskItem` 的结果，可接受（归档行右键改标签/删除仍有用）
- 不参与 DnD 排序、不参与 heading 分组

### 显隐规则

- 无已完成任务（`completedTasks.length === 0`）→ 整块不渲染（`return null`）
- 加载中（`isLoading`）→ `return null`（不阻塞活跃任务区）
- 错误态（`isError`）→ `return null`（静默失败）

### 持久化 UI 偏好 store 模式

`src/lib/stores/projectUiPrefs.store.ts` 是「按实体 ID 存储偏好」的持久 store 模式：

- Zustand + `persist` 中间件，localStorage key 用 `taskora-*` 前缀
- state 为 `Record<entityId, boolean>` 形式，每个实体独立记忆
- 与 `theme.store.ts`（全局偏好）的区别：按实体 ID 维度存储，消费方传 `projectId` 读取
- 与 `uiInteraction.store.ts`（瞬态）的区别：持久化，刷新后保持
