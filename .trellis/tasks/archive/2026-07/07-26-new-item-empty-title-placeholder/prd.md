# 新建任务/项目/区域：空标题占位符展示

## Goal

新建任务/项目/区域时，标题不再使用默认值（"新任务"等）作为实际存储值，改为存储空字符串。当标题为空时，UI 显示统一占位符"新建任务/新建项目/新建区域"；进入编辑态时输入框仍为空字符串。占位符仅是显示值，不写入数据库。

## Background

当前行为不一致：

- **任务**（`ContentBottomBar.tsx`）：新建时 `title: t('task:newTask')`（"新任务"）作为实际标题存入数据库；`TaskItem.tsx` 通过 `current.title === t('task:newTask')` 判断"刚创建需自动聚焦标题输入框"。这导致占位词被持久化为真实标题。
- **项目/区域**（`SidebarBottomBar.tsx`）：已经是 `title: ''` 创建，跳转详情页用 `InlineTitleEdit`（空标题时显示 `{value || placeholder}`），但列表项 `ProjectItem` / `AreaItem` 直接渲染 `project.title` / `area.title`，空时不显示占位符。
- i18n 占位文案不统一：`task:newTask`="新任务"、`project:titlePlaceholder`="项目名称"、`area:titlePlaceholder`="区域名称"。

## Requirements

### R1. 新建时标题存储为空字符串（不持久化占位符）

- 任务：`ContentBottomBar.tsx` 新建任务 payload 从 `title: t('task:newTask')` 改为 `title: ''`。
- 项目/区域：`SidebarBottomBar.tsx` 已为 `title: ''`，保持不变。
- 后端 `CreateTaskDto` / `CreateProjectDto` / `CreateAreaDto` 的 `title` 仅有 `@IsString()`，无 `@IsNotEmpty()`，空字符串已被接受，无需后端改动。

### R2. 任务列表占位符展示

- `TaskItem.tsx` 折叠态：标题为空时显示占位符 `t('task:newTaskPlaceholder')`（"新建任务"）。
- `TaskItem.tsx` 展开态 Input：`placeholder` 设为 `t('task:newTaskPlaceholder')`，`value` 仍为 `current.title`（实际空串）。
- `TaskItem.tsx` 自动聚焦判定：从"标题===占位词"改为"标题为空"（`current.title === ''`），用于新建后自动展开+聚焦。

### R3. 项目/区域列表占位符展示

- `ProjectItem.tsx`：`project.title || t('project:newItemPlaceholder')`。
- `AreaItem.tsx`：`area.title || t('area:newItemPlaceholder')`。

### R4. 项目/区域详情页占位符展示

- `ProjectDetail.tsx`：`InlineTitleEdit` 的 `placeholder` 改为 `t('project:newItemPlaceholder')`。
- `AreaDetail.tsx`：`InlineTitleEdit` 的 `placeholder` 改为 `t('area:newItemPlaceholder')`。
- `InlineTitleEdit.tsx` 已有 `{value || placeholder}` 展示逻辑，无需改组件本身。

### R5. i18n 占位符文案统一

新增/调整 i18n key（中/英 key 集合保持一致）：

| Namespace | Key | zh | en |
|-----------|-----|----|----|
| task | `newTaskPlaceholder` | 新建任务 | New Task |
| project | `newItemPlaceholder` | 新建项目 | New Project |
| area | `newItemPlaceholder` | 新建区域 | New Area |

- `ProjectForm` / `AreaForm` 对话框内 Input 的 `placeholder` 保持现有 `titlePlaceholder`（"项目名称"/"区域名称"）不变 —— 对话框是表单输入场景，与列表展示占位符语义不同。
- `task:newTask`（"新任务"）若不再被引用则可删除；需先 grep 确认无其他引用。

## Acceptance Criteria

- [ ] AC1. 通过底部栏"+"新建任务后，数据库存储的 title 为空字符串（`''`），不是"新任务"。
- [ ] AC2. 新建任务后该任务行展开，标题输入框为空，placeholder 显示"新建任务"。
- [ ] AC3. 任务折叠态，若标题为空，列表显示"新建任务"（灰色淡化，与 `text-muted-foreground` 一致）。
- [ ] AC4. 侧边栏新建项目/区域后，数据库 title 为空字符串；详情页标题显示"新建项目"/"新建区域"占位符。
- [ ] AC5. 侧边栏项目/区域列表项，若标题为空，显示"新建项目"/"新建区域"占位符。
- [ ] AC6. 编辑态输入框 value 始终为实际存储值（空串），占位符不进入输入框 value。
- [ ] AC7. 中/英 i18n key 集合一致（`jq -S 'keys'` 校验通过）。
- [ ] AC8. `tsc -b` 与前端 lint 通过。

## Out of Scope

- 后端 DTO 校验改动（后端已接受空串）。
- `ProjectForm` / `AreaForm` 对话框内 placeholder 文案调整。
- 标签（Tag）创建流程的空标题占位符。
- 子任务创建的占位符逻辑（`TaskRowExpanded` 的 `addSubtask` Input 已有独立 placeholder）。

## Technical Notes

- `InlineTitleEdit.tsx` 第 96 行已有 `{value || placeholder}` 展示逻辑、第 105 行 input 已有 `placeholder`，无需改组件。
- `TaskItem.tsx` 第 61 行 `current.title === t('task:newTask')` 判定需改为 `current.title === ''`，避免依赖 i18n 字符串匹配（脆弱）。
- `TaskItem.tsx` 折叠态 span（第 111-117 行）需改为 `{current.title || t('task:newTaskPlaceholder')}`，空标题时用 `text-muted-foreground` 淡化。
- 删除 `task:newTask` key 前需全局 grep 确认无引用。