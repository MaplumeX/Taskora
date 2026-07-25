# Design — Inline expandable task row

## 架构与边界

改造范围限定在前端 `packages/frontend/src`，后端零改动。

### 组件形态变化

| 旧 | 新 | 职责 |
|---|---|---|
| `TaskDetail.tsx` (Dialog) | **删除** | — |
| `TaskItem.tsx`（单行展示） | `TaskItem.tsx`（重构成行容器） | 管理 idle/selected/expanded 三态视觉，展开时内嵌 `TaskRowExpanded` |
| — | `TaskRowExpanded.tsx`（新增） | 展开区内容：标题/备注/图标菜单/子任务。移植自 `TaskDetailBody` |
| — | `popover.tsx`（新增 ui） | 基于 `@radix-ui/react-popover` 的 shadcn 风格封装 |
| `TaskList.tsx` | 保留，接口扩展 | 传递 `selectedId`/`expandedId`/`onRowClick` 给 `TaskItem` |
| `TaskListView.tsx` | 保留，状态机上移 | 持有 `selectedId` + `expandedId`，替换原 Dialog 状态 |

### 状态机（R1）

```
idle ──click row──▶ selected ──click same row──▶ expanded
 ▲                   │                              │
 │                   │ click other row / blank      │ click same row
 │                   └──────────────────────────────┘
 └─────────────────────────────────────────────────┘
```

实现：在 `TaskListView` 顶层用两条 `useState` 管 `selectedId`、`expandedId`。

```ts
const [selectedId, setSelectedId] = useState<string | null>(null);
const [expandedId, setExpandedId] = useState<string | null>(null);

const handleRowClick = (id: string) => {
  if (expandedId === id) {           // expanded → selected (折叠)
    setExpandedId(null);
  } else if (selectedId === id) {     // selected → expanded
    setExpandedId(id);
  } else {                            // idle / 他行 → 选中他行
    setSelectedId(id);
    setExpandedId(null);
  }
};

const handleBlankClick = () => { setSelectedId(null); setExpandedId(null); };
```

空白点击：`TaskListView` 外层 `<div onClick={handleBlankClick}>`，子节点 `stopPropagation`。

### 选中态归属：为什么放 TaskListView 而非 Zustand

`.trellis/spec/frontend/directory-structure.md` 明确：Zustand 仅放 auth/token 等**跨页面持久**的客户端 UI 状态。选中态是列表级、页内瞬态，用 `useState` 即可，不引入全局 store。

### Logbook 接入策略

Logbook 按 今天/昨天/更早 分组渲染，与 `TaskListView` 的平铺列表不一致。方案：抽 `useTaskRowSelection()` hook 复用状态机，Logbook 自行渲染分组 + `TaskItem`，不强行塞进 `TaskListView`。

```ts
function useTaskRowSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // ... 同上 handleRowClick / handleBlankClick
  return { selectedId, expandedId, handleRowClick, handleBlankClick };
}
```

`TaskListView` 内部也用同一 hook。

## Popover 组件选型

新增依赖 `@radix-ui/react-popover`。理由：
- `DropdownMenu` 是菜单语义，不支持在弹层内嵌日期选择器 `<input type="date">` 这类非菜单 UI
- Radix Popover 与现有 Radix 组件族一致，shadcn 已有标准封装模板
- 图标触发 + 弹层内容完全自定义，满足 R6

## 展开区数据来源

- `TaskRowExpanded` 接收 `task: TaskResponseDto`，内部用 `useTaskQuery(task.id)` 拉最新值（保留现有 `liveTask ?? task` 模式）
- 所有变更走 `useUpdateTask` / `useCompleteTask` 等 hook，不变

## 子任务就地编辑（R3 新增）

原 `TaskDetail` 中子任务（SubtaskRow）只有 checkbox + 删除。新增：
- 子任务标题点击进入编辑态（本地 `editingId` + `draftTitle`）
- onBlur / Enter 调 `useUpdateTask({ id, data: { title } })`
- ESC 取消编辑（可选，低成本就加上）

## 文件改动清单

**新增**
- `packages/frontend/src/components/ui/popover.tsx`
- `packages/frontend/src/components/task/TaskRowExpanded.tsx`
- `packages/frontend/src/lib/hooks/useTaskRowSelection.ts`

**修改**
- `packages/frontend/src/components/task/TaskItem.tsx` — 重构为支持三态 + 内嵌展开
- `packages/frontend/src/components/task/TaskList.tsx` — 透传 selection props
- `packages/frontend/src/components/task/TaskListView.tsx` — 用 hook 替换 Dialog
- `packages/frontend/src/pages/Logbook.tsx` — 用 hook + 新 TaskItem，移除 Dialog
- `packages/frontend/package.json` — 加 `@radix-ui/react-popover`

**删除**
- `packages/frontend/src/components/task/TaskDetail.tsx`

**清理引用**
- `TaskListView.tsx`、`Logbook.tsx`、`Upcoming.tsx`（如直接引用了 TaskDetail）

## 验证命令
```bash
cd packages/frontend
pnpm tsc --noEmit          # 类型零错误
pnpm build                 # vite 构建通过
pnpm test -- --run         # 现有测试不回归（若有 TaskItem 相关）
```

## 兼容性 / 回滚
- 纯前端改动，后端契约不变
- 回滚 = revert 本次 commit，无数据迁移
- 风险点：`useTaskRowSelection` 的空白点击判定若外层 onClick 范围太大可能误折叠 → 验证时确认点击展开区内容不触发折叠（展开区 div 需要 `stopPropagation`）

## Out of scope（重申）
- 拖拽排序、键盘快捷键体系、移动端适配、后端改动