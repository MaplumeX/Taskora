# Design: 新建任务/项目/区域空标题占位符

## 影响范围

纯前端改动，约 8 个文件：

| 文件 | 改动 |
|------|------|
| `components/layout/ContentBottomBar.tsx` | 新建任务 `title: ''` |
| `components/task/TaskItem.tsx` | 自动聚焦判定改 `title === ''`；折叠态展示占位符；展开态 Input 加 placeholder |
| `components/project/ProjectItem.tsx` | 空标题展示占位符 |
| `components/area/AreaItem.tsx` | 空标题展示占位符 |
| `pages/ProjectDetail.tsx` | `InlineTitleEdit` placeholder 改为 `newItemPlaceholder` |
| `pages/AreaDetail.tsx` | `InlineTitleEdit` placeholder 改为 `newItemPlaceholder` |
| `i18n/locales/{zh,en}/task.json` | 加 `newTaskPlaceholder`，删 `newTask` |
| `i18n/locales/{zh,en}/project.json` | 加 `newItemPlaceholder` |
| `i18n/locales/{zh,en}/area.json` | 加 `newItemPlaceholder` |

`InlineTitleEdit.tsx`、`SidebarBottomBar.tsx`、`ProjectForm.tsx`、`AreaForm.tsx`、后端均无需改动。

## 数据流

### 新建任务（底部栏"+"按钮）

```
点击 "+" → createTask.mutate({ title: '', ...ctx })
         → 后端存储 title=''
         → onSuccess: setParams({ expand: created.id })
         → TaskItem 展开，TaskItem 检测 current.title === '' → 自动 focus+select 标题输入框
         → 输入框 value='' (空), placeholder='新建任务' 显示
```

### 新建项目/区域（侧边栏底栏"新增"菜单）

```
点击 "新增项目" → createProject.mutate({ title: '' })
                → navigate('/projects/:id', { state: { editTitle: true } })
                → ProjectDetail 读 autoEdit → InlineTitleEdit autoFocusAndSelect
                → h1 展示 value('') || placeholder('新建项目')
                → 点击进入编辑态，input value='' placeholder='新建项目'
```

## 关键决策

### D1. 折叠态空标题用 `text-muted-foreground` 淡化

列表中空标题占位符用灰色（`text-muted-foreground`）与真实标题（`text-foreground`）区分，让用户视觉上识别"这是新建未命名的条目"。

### D2. TaskItem 自动聚焦判定从字符串匹配改为空值判定

原 `current.title === t('task:newTask')` 依赖 i18n 字符串，语言切换或文案改动会破坏判定。改为 `current.title === ''` 更稳健，且语义更准确（"标题为空即刚创建未命名"）。

### D3. 列表占位符与对话框 placeholder 语义分离

- 列表/详情页占位符（`newTaskPlaceholder` / `newItemPlaceholder` = "新建XX"）：表示"这是一个新建未命名的条目"。
- 对话框 Input placeholder（`titlePlaceholder` = "项目名称"/"区域名称"）：表示"请在此输入名称"。

两者语义不同，保持分离，不强行统一。

### D4. 删除 `task:newTask` key

改造后 `task:newTask` 无任何引用。为避免 i18n 残留死 key，删除它（zh/en 同步删除）。`common:newProject` / `common:newArea` 仍有引用（SidebarBottomBar 菜单项文案），保留不动。

## 兼容性

- 已存在的"新任务"标题数据（如有）不受影响，仍正常显示为"新任务"（它们有真实 title 值）。本次改动只影响新建流程。
- 后端无改动，API 兼容。