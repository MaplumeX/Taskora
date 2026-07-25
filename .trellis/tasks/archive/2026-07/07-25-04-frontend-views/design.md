# Frontend Views - Technical Design

## 概述

实现 Things3 风格的核心 GTD 视图与交互。基于 `03-frontend-core` 搭建的脚手架（路由、API 层、hooks、布局）。

参考 parent design.md §5（前端架构）、§6（视觉设计）。

## 已有基础设施（来自 03-frontend-core）

- 路由：所有视图页面已有占位文件（`src/pages/Inbox.tsx` 等）
- API 层：`lib/api/tasks.api.ts` 等已封装全部端点
- Hooks：`useTasksQuery(view)`, `useCreateTask`, `useUpdateTask`, `useDeleteTask` 等已就绪
- 布局：`AppShell`（240px 侧边栏 + 720px 主区）、`Sidebar`（导航项）
- shadcn/ui：Button, Input, Dialog, DropdownMenu, Checkbox, Separator, ScrollArea, Sonner

## 需要实现的组件

### 任务组件（`src/components/task/`）

| 组件 | 职责 |
|---|---|
| `TaskItem` | 单个任务行：复选框 + 标题 + 日期 + project/area 标签 |
| `TaskList` | 任务列表渲染，空状态 |
| `TaskDetail` | 任务详情面板/弹窗：编辑标题/备注、设置日期、管理子任务 |
| `TaskCheckbox` | 复选框 + 完成动画 |
| `QuickAddTask` | 快速添加输入框（回车提交） |
| `TaskContextMenu` | 右键菜单：完成、移到废纸篓 |
| `TaskDateBadge` | 日期标签（今天/明天/过期 着色） |

### 项目组件（`src/components/project/`）

| 组件 | 职责 |
|---|---|
| `ProjectItem` | 项目列表项 |
| `ProjectForm` | 创建/编辑项目表单（Dialog） |

### 区域组件（`src/components/area/`）

| 组件 | 职责 |
|---|---|
| `AreaItem` | 区域列表项 |
| `AreaForm` | 创建/编辑区域表单（Dialog） |

## 视图页面实现

### Inbox
- `useTasksQuery('inbox')` 获取任务
- 顶部 `QuickAddTask`（默认 bucket=INBOX）
- `TaskList` 渲染

### Today
- `useTasksQuery('today')` 获取任务
- `QuickAddTask`（设 dueDate=今天）
- `TaskList` 渲染，过期任务红色标注

### Upcoming
- `useTasksQuery('upcoming')` 获取任务
- 按 dueDate 分组（日期 header + 任务列表）
- 无快速添加（未来日期任务通过任务详情设置）

### Anytime
- `useTasksQuery('anytime')` 获取任务
- `QuickAddTask`（需先选 project/area，或默认 INBOX 后手动移）
- `TaskList` 渲染

### Someday
- `useTasksQuery('someday')` 获取任务
- `QuickAddTask`（bucket=SOMEDAY）
- `TaskList` 渲染

### Projects
- `useProjectsQuery` 获取项目列表
- `ProjectItem` 渲染，点击进入 `/projects/:id`
- 顶部"新建项目"按钮 → `ProjectForm` Dialog
- `ProjectDetail`：`useTasksQuery({ projectId })` 获取项目下任务 + `TaskList`

### Areas
- `useAreasQuery` 获取区域列表
- `AreaItem` 渲染，点击进入 `/areas/:id`
- 顶部"新建区域"按钮 → `AreaForm` Dialog
- `AreaDetail`：显示区域下项目 + 任务

### Trash
- `useTasksQuery('trash')` 获取已删除任务
- 每项有"恢复"按钮
- 顶部"清空废纸篓"按钮（可选）

## 任务详情交互

- 点击任务标题 → 打开 `TaskDetail`（Dialog 或右侧面板）
- 编辑标题（Input，失焦保存）
- 编辑备注（Textarea）
- 设置/修改 dueDate（日期选择器，可用 native input type=date）
- 移动到 project/area（DropdownMenu）
- 管理子任务：列表 + 添加子任务输入框

## 视觉设计要点

参见 parent design.md §6。关键：
- 主色蓝 #4477CE（复选框、强调）
- 任务行高 ~48px，大量留白
- 完成动画：复选框填充 → 标题画删除线 → 淡出
- 过期日期红色 #CC4444
- 侧边栏导航图标用 lucide-react