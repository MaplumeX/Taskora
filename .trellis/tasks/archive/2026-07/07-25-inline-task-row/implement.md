# Implement — Inline expandable task row

## 执行顺序

### Step 1: 新增 Popover UI 组件
- 安装依赖：`cd packages/frontend && pnpm add @radix-ui/react-popover`
- 新建 `components/ui/popover.tsx`（shadcn 标准封装：Popover / PopoverTrigger / PopoverContent）

### Step 2: 抽 selection hook
- 新建 `lib/hooks/useTaskRowSelection.ts`
- 导出 `{ selectedId, expandedId, handleRowClick, handleBlankClick }`
- 状态机逻辑见 design.md

### Step 3: 新建 TaskRowExpanded
- 新建 `components/task/TaskRowExpanded.tsx`
- 从 `TaskDetail.tsx` 的 `TaskDetailBody` 移植：标题/备注编辑、子任务列表
- 把原有的 select/button 控件改为图标 + Popover 小菜单：
  - 日期：Calendar 图标 → Popover（无/日期/Someday 三态 + `<input type="date">`）
  - 项目：Folder 图标 → Popover（列表 + 「无」）
  - 区域：Target 图标 → Popover（列表 + 「无」）
  - 标签：Tag 图标 → Popover（多选 toggle）
  - 删除：Trash2 图标按钮
- 子任务新增编辑态（editingId + draftTitle，onBlur/Enter 提交，ESC 取消）
- Props: `{ task: TaskResponseDto; onClose: () => void }`，内部 `useTaskQuery(task.id)`

### Step 4: 重构 TaskItem
- 新增 props：`selectionState: 'idle' | 'selected' | 'expanded'`、`onRowClick: () => void`
- 行容器加三态视觉：idle 默认；selected 高亮 bg-muted；expanded 高亮 + 展开区
- checkbox 保持 `stopPropagation`
- 点击标题区域 → `onRowClick`（不再触发 `onOpenDetail`）
- 移除 `onOpenDetail` prop
- `expanded` 时内嵌渲染 `<TaskRowExpanded task={task} onClose={...} />`
- 隐藏部分行尾元信息 badge 在 expanded 时（呼应 Things 3）

### Step 5: TaskList 接口扩展
- 新增 props：`selectedId`、`expandedId`、`onRowClick`
- 透传给每个 `TaskItem`，按 task.id 计算 `selectionState`

### Step 6: TaskListView 改造
- 用 `useTaskRowSelection()` 替换原 `selected`/`open` Dialog 状态
- 外层 div 绑 `onClick={handleBlankClick}`
- 移除 `TaskDetail` import 与 JSX
- 透传 selection props 给 `TaskList`

### Step 7: Logbook 改造
- 移除 `TaskDetail` import 与 JSX
- 引入 `useTaskRowSelection()` + 新 `TaskItem`
- 分组渲染 `<TaskItem>` 时透传 selection props
- 外层容器绑 `handleBlankClick`

### Step 8: 删除 TaskDetail.tsx
- `rm packages/frontend/src/components/task/TaskDetail.tsx`
- 全局 grep 确认无残留引用

### Step 9: 验证
```bash
cd packages/frontend
pnpm tsc --noEmit
pnpm build
```
- 手测：Inbox / Today / Upcoming / Anytime / Someday / ProjectDetail / AreaDetail / Logbook
  - 单击选中 → 再点展开 → 再点折叠 → 点他行切换 → 点空白取消

## 风险点 / 回滚
- 空白点击误折叠：展开区根 div 需 `onClick={e => e.stopPropagation()}`
- 子任务编辑态与父行选中态冲突：子任务 input 的 onClick 必须 `stopPropagation`
- 回滚：revert 单次 commit，无数据迁移

## 审查门
- tsc + build 通过后再标记完成
- 手测覆盖全部 8 个页面