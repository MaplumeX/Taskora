# Inline expandable task row (Things 3 style)

## Goal

将任务编辑从「详情弹窗 Dialog」改为「列表行内展开」的 Things 3 风格：点击任务行即在原位展开编辑区（备注、日期、项目、区域、标签、子任务），再点一次折叠。完全移除 `TaskDetail` 弹窗组件。

## Value

- 编辑任务时不脱离当前列表上下文，减少打断感
- 交互更接近用户熟悉的 Things 3 桌面端体验
- 子任务也能就地增删改，无需弹窗

## 现状（代码事实）

- `TaskListView` 组合 `TaskList` + `TaskDetail`（Dialog）。Inbox/Today/Upcoming/Anytime/Someday/ProjectDetail/AreaDetail 均通过 `TaskListView` 渲染。
- `Logbook` 页面**独立**使用 `TaskItem` + `TaskDetail`（不经过 `TaskListView`），按 今天/昨天/更早 分组。
- `TaskItem` 是单行展示组件，点击标题触发 `onOpenDetail` 回调 → 打开 Dialog。
- `TaskDetail.tsx` 是约 230 行的 Dialog 组件，承载所有字段编辑逻辑。
- 后端 `PATCH /tasks/:id` 已支持全字段更新，**后端无需改动**。
- `useTaskQuery(id)` 已有单任务详情查询 hook，可复用于展开行实时数据。
- 现有 UI 组件库：button / checkbox / dialog / dropdown-menu / input / label / scroll-area / separator / sonner / textarea。**无 popover 组件**，Things 3 风格的图标小菜单需要新增。

## Requirements

### R1 行内展开交互（单选 + 自动折叠状态机）

每行三状态：`idle`（未选中）→ `selected`（高亮）→ `expanded`（展开编辑区）。

- 单击未选中行 → 该行变 `selected`，其它行自动回到 `idle`（同时折叠）
- 单击 `selected` 行 → 进入 `expanded`，原位展开编辑区
- 单击 `expanded` 行 → 回到 `selected`（折叠编辑区）
- 单击他行 → 当前选中/展开行折叠并回到 `idle`，他行变 `selected`
- 点击列表外部空白 → 当前选中/展开行折叠并回到 `idle`
- checkbox 点击不参与状态机（已有 `e.stopPropagation()`），仅切换完成状态
- 全局同时最多只有一个 `selected` / `expanded` 行

### R2 展开区内容（替代原 TaskDetail Body）
- 标题：就地可编辑 input（onBlur / Enter 提交）
- 备注：就地可编辑 textarea（onBlur 提交）
- 日期：日历图标 → 弹出小菜单，含「无 / 日期 / Someday」三态 + 日期选择器
- 项目：文件夹图标 → 弹出小菜单，选择项目或「无」
- 区域：目标图标 → 弹出小菜单，选择区域或「无」
- 标签：标签图标 → 弹出小菜单，多选标签
- 删除：移到废纸篓按钮/图标

### R3 子任务就地管理
- 展开区内显示子任务列表
- 子任务标题可就地编辑（点击进入编辑态，onBlur/Enter 提交）
- 子任务可完成/取消完成、删除
- 可添加新子任务（输入框 + Enter）

### R4 移除 TaskDetail 弹窗
- 删除 `packages/frontend/src/components/task/TaskDetail.tsx`
- 删除所有引用（`TaskListView`、`Logbook`、`Upcoming`）
- 清理因移除产生的孤儿导入与状态

### R5 全页面接入
- Inbox / Today / Upcoming / Anytime / Someday / ProjectDetail / AreaDetail：经 `TaskListView` 统一接入
- Logbook：改为走新的行内展开机制（不再独立使用旧 `TaskItem` + Dialog）

### R6 图标小菜单（Things 3 风格）
- 新增 Popover 组件（基于 Radix Popover 或复用 DropdownMenu）
- 展开区右侧（或行尾）显示一组图标按钮，点击弹出对应小菜单
- 每个菜单项内容对应 R2 中的字段

## Acceptance Criteria

- [ ] AC1：在任一列表页，点击任务行后在原位展开编辑区，不弹出任何 Dialog
- [ ] AC2：标题/备注可就地编辑，失焦或回车后保存（PATCH /tasks/:id 触发）
- [ ] AC3：日期图标菜单可切换 无/日期/Someday，选日期后 scheduledDate 更新
- [ ] AC4：项目/区域图标菜单可切换关联，清空选项生效
- [ ] AC5：标签图标菜单可多选 toggle 标签
- [ ] AC6：子任务可添加、标题可编辑、可完成/取消/删除
- [ ] AC7：Logbook 页面任务行也可展开查看（已完成任务可取消完成、移到废纸篓）
- [ ] AC8：`TaskDetail.tsx` 被删除，无残留引用，项目可正常 `tsc` + `vite build`
- [ ] AC9：无 TypeScript 类型错误，无运行时控制台错误

## Out of Scope

- 后端 API 改动（`PATCH /tasks/:id` 已满足）
- 拖拽排序
- 键盘快捷键体系（仅保留 Enter 提交）
- 移动端专项适配

## Resolved Decisions

- 展开触发方式：单击选中 → 再单击展开（带中间选中态，类似 Things 3）
- 选中态生命周期：单选 + 自动折叠。同时最多一个选中行；点击他行或列表空白处折叠并取消选中。