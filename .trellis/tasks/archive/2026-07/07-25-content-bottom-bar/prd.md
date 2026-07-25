# PRD — 内容区底栏（搜索模态框 + 快速添加进入编辑态）

## 背景

当前内容区顶部常驻 `SearchBar`；添加任务由各页面内嵌 `QuickAddTask` 输入框承担（带不同上下文：Today→dueToday、Someday→SOMEDAY、ProjectDetail→projectId 等）。用户希望按 Things3 风格把这两类操作收到内容区**底部共享栏**，并让"添加任务"直接创建一个任务并进入行内展开编辑态。

## 目标

1. 内容区底部新增跨页面共享底栏，含两个按钮：搜索、添加任务。
2. 点搜索按钮 → 弹出搜索模态框进行搜索（替代常驻顶栏）。
3. 点添加任务按钮 → 直接创建一个新任务并自动进入其行内展开编辑态。
4. 移除各页面内嵌的 `QuickAddTask`。

## 需求

### F1 底栏

- 位置：`AppShell` 层，内容区（`MainContent`）正下方，跨所有已登录页面共享。
- 布局：紧凑横向栏，两个图标按钮（搜索、添加任务/Plus）。
- 新增组件：`components/layout/ContentBottomBar.tsx`。

### F2 搜索模态框

- 点底栏搜索按钮 → 打开 Dialog 模态框。
- 模态框内复用现有 `SearchBar` 的搜索逻辑（防抖输入、包含已完成勾选、结果列表用 `TaskListView`）。
- 快捷键 Cmd/Ctrl+K 改为打开搜索模态框（原来是聚焦顶栏输入框）。
- Esc 关闭模态框（Dialog 默认行为）。
- 新增组件：`components/search/SearchModal.tsx`；移除/删除旧 `SearchBar.tsx`。

### F3 添加任务（创建后进入编辑态）

- 点底栏"添加任务"按钮 → 调用后端创建一个占位标题任务（title = "新任务"），携带当前页面上下文（见 F4）。
- 创建成功后：失效（invalidate）tasks 列表查询，并使该新任务行进入展开编辑态（`expandedId` 指向新任务 id）。
- 进入编辑态后自动聚焦标题输入框并选中全部文本，方便用户直接覆盖输入。
- 底栏按钮需感知当前页面上下文（见 F4）。

### F4 页面上下文映射

新建 hook `usePageTaskContext()`，基于路由解析当前页应附加到 `CreateTaskDto` 的上下文字段：

| 路由 | 上下文字段 |
|---|---|
| `/inbox` | 无 |
| `/today` | `scheduledType=DATE`, `scheduledDate=今天` |
| `/anytime` | 无（保持原 `QuickAddTask` 行为） |
| `/someday` | `scheduledType=SOMEDAY` |
| `/projects/:id` | `projectId=id` |
| 其他页面（Upcoming/Projects/Areas/Areas/:id/Tags/Tags/:tagId/Trash/Logbook） | 无（创建纯任务，进入收件箱） |

### F5 移除各页面 QuickAddTask

从 Inbox / Today / Anytime / Someday / ProjectDetail 中移除 `<QuickAddTask />` 渲染与相关 import。

## 不在本次范围

- 搜索结果点击不做跨页跳转（保持现有 `TaskListView` 行内展开行为，用户手动关闭模态框）。
- 占位任务（"新任务"）若用户未修改标题即离开，不自动回收——保留为普通任务，用户可后续删除。属后续可选优化。
- 底栏不含统计、视图切换等其他控件。

## 验收标准

- [AC1] 所有已登录页面底部均显示共享底栏，含搜索与添加任务两个按钮。
- [AC2] 内容区顶部不再有常驻搜索栏。
- [AC3] 点搜索按钮弹出模态框，输入关键词（带防抖）显示结果列表；勾选"包含已完成"生效；Esc 关闭。
- [AC4] Cmd/Ctrl+K 打开搜索模态框。
- [AC5] 任一页面点击添加任务按钮均创建任务并进入该任务行内展开编辑态；标题输入框自动聚焦且文本全选。
- [AC6] Today 页添加的任务 scheduledDate=今天；Someday 页添加的任务 scheduledType=SOMEDAY；ProjectDetail 页添加的任务 projectId 对应当前项目。
- [AC7] Inbox/Today/Anytime/Someday/ProjectDetail 页面不再渲染 `<QuickAddTask />`。
- [AC8] 类型检查（tsc）与 lint 通过；现有任务勾选/展开/删除/子任务增删等交互不受回归。