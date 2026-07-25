# Design — 内容区底栏

## 1. 涉及改动一览

| 改动 | 文件 |
|---|---|
| AppShell 布局：顶部 SearchBar → 底部 ContentBottomBar | `components/layout/AppShell.tsx` |
| 新增底栏 | `components/layout/ContentBottomBar.tsx` (新) |
| 新增搜索模态框（迁移 SearchBar 逻辑） | `components/search/SearchModal.tsx` (新) |
| 删除旧常驻搜索栏 | `components/search/SearchBar.tsx` (删) |
| 新增页面上下文 hook | `lib/hooks/usePageTaskContext.ts` (新) |
| expandedId 改由 URL `?expand=` 派生 | `lib/hooks/useTaskRowSelection.ts` |
| 新建任务后自动展开 + 聚焦标题 | `components/task/TaskRowExpanded.tsx` |
| 移除各页面 QuickAddTask | `pages/Inbox.tsx`、`pages/Today.tsx`、`pages/Anytime.tsx`、`pages/Someday.tsx`、`pages/ProjectDetail.tsx` |
| 删除 QuickAddTask 组件 | `components/task/QuickAddTask.tsx` (删) |

## 2. 布局结构（AppShell）

```
<div flex h-screen>
  <Sidebar />
  <div flex flex-1 flex-col>
    <MainContent />        // overflow-y-auto（原样）
    <ContentBottomBar />   // 新：底部栏，shrink-0
  </div>
</div>
```

`MainContent` 维持 `flex-1 overflow-y-auto`；`ContentBottomBar` 为 `shrink-0` 紧凑栏。

## 3. ContentBottomBar 组件

```
<footer flex h-12 items-center justify-center gap-2 border-t bg-background px-4>
  <Button variant="ghost" size="icon" aria-label="搜索任务" onClick={openSearch}>
    <Search />
  </Button>
  <Button variant="ghost" size="icon" aria-label="添加任务" onClick={handleAddTask}>
    <Plus />
  </Button>
</footer>
```

内部状态：
- `searchOpen`（useState）控制 SearchModal 显隐。
- Cmd/Ctrl+K 全局快捷键 → `setSearchOpen(true)`（从旧 SearchBar 迁移）。
- `handleAddTask` 逻辑见 §5。

## 4. SearchModal 组件

基于 shadcn `Dialog`。内容迁移自旧 `SearchBar`：

```
<Dialog open={searchOpen} onOpenChange={setSearchOpen}>
  <DialogContent className="max-w-xl">
    <DialogHeader><DialogTitle>搜索任务</DialogTitle></DialogHeader>
    // 以下内容与旧 SearchBar 的非外层容器部分一致：
    // - Input（带 Search 图标、清空按钮）
    // - 包含已完成 Checkbox
    // - 防抖 useDebouncedValue(300)
    // - useTasksQuery({ q, completed })
    // - ScrollArea max-h-[60vh] + TaskListView / 空态
  </DialogContent>
</Dialog>
```

注意：旧 `SearchBar` 中 Cmd/Ctrl+K 快捷键与 Esc 行为不再放在搜索组件内，改为：
- Cmd/Ctrl+K 由 `ContentBottomBar` 统一监听打开模态框。
- Esc 关闭由 Dialog 默认行为提供（无需手写）。

## 5. 添加任务流程（handleAddTask）

```
const ctx = usePageTaskContext();          // { scheduledType?, scheduledDate?, projectId? }
const createTask = useCreateTask();
const navigate = useNavigate();
const [, setParams] = useSearchParams();

handleAddTask = () => {
  const payload: CreateTaskDto = { title: '新任务', ...ctx };
  createTask.mutate(payload, {
    onSuccess: (created) => {
      // 1) 失效列表（让当前页列表出现新任务）
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      // 2) 通过 URL ?expand=id 触发该行展开
      setParams({ expand: created.id });
    },
    onError: () => toast.error('创建失败'),
  });
};
```

### 5.1 页面上下文 hook：usePageTaskContext

```
export function usePageTaskContext(): Partial<Pick<CreateTaskDto,
  'scheduledType' | 'scheduledDate' | 'projectId'>> {
  const { pathname, params } = useMatch(...) // 用 useLocation + useParams
  ...
}
```

实现用 `useLocation().pathname` + 正则匹配：
- `/today` → `{ scheduledType: DATE, scheduledDate: new Date().toISOString() }`
- `/someday` → `{ scheduledType: SOMEDAY }`
- 匹配 `/projects/:id` → `{ projectId: id }`（用 `useParams`）
- 其余 → `{}`

返回值直接 spread 到 `CreateTaskDto`。

## 6. expandedId 改由 URL 派生（useTaskRowSelection 改造）

### 6.1 为什么不用 Zustand

spec `state-management.md` / `component-guidelines.md` 明确：列表级瞬态用 `useState`，Zustand 仅放 auth/token 等跨页面持久状态。因此跨组件（底栏 → 页面列表）驱动展开**不能**走 Zustand。

### 6.2 方案：URL `?expand=` 作为展开信号源

spec 同时认可 URL 状态层用于"选中的项目/区域 id"。将 `expandedId` 从 `useState` 改为派生自 `useSearchParams().get('expand')`：

```
export function useTaskRowSelection() {
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const expandedId = params.get('expand');

  const setExpandedId = useCallback((id: string | null) => {
    setParams(id ? { expand: id } : {}, { replace: true });
  }, [setParams]);

  const handleRowClick = useCallback((id: string) => {
    if (expandedId === id) {
      setExpandedId(null);            // expanded → selected（折叠）
    } else if (selectedId === id) {
      setExpandedId(id);              // selected → expanded
    } else {
      setSelectedId(id);              // idle/他行 → 选中
      setExpandedId(null);
    }
  }, [selectedId, expandedId, setExpandedId]);

  const handleBlankClick = useCallback(() => {
    setSelectedId(null);
    setExpandedId(null);
  }, [setExpandedId]);

  return { selectedId, expandedId, handleRowClick, handleBlankClick };
}
```

影响面：`TaskListView`、`Upcoming`、`Logbook` 三个调用点——API 签名不变，行为保持一致。

### 6.3 副作用与取舍

- 展开态写入 URL → 刷新页面仍保持展开（可接受，甚至有用）。
- `replace: true` 避免污染历史栈（展开/折叠不产生后退项）。
- selectedId 仍为局部 useState（瞬态，符合 spec）。

## 7. 自动聚焦标题（TaskRowExpanded）

当任务因"新建"流程被展开时，标题输入框需自动聚焦并全选。判定：

```
const expandedId = useSearchParams().get('expand');  // 或通过 props
useEffect(() => {
  if (expandedId === task.id && current.title === '新任务') {
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }
}, [expandedId, task.id]);
```

- 给 `<Input value={title}>` 加 `ref`。
- 仅当当前展开 id 命中本任务且标题仍为占位"新任务"时聚焦——避免影响手动展开既有任务的行为。
- 边界：用户手动展开一个恰好名为"新任务"的旧任务时也会聚焦；极少见，可接受。

## 8. 边界与已知限制

- 搜索结果点击不跨页跳转（保持 `TaskListView` 行内展开）。
- 占位任务未改标题即离开 → 保留为"新任务"任务，不自动回收。
- Anytime 页"添加任务"按原 `QuickAddTask` 行为创建无上下文任务（默认进收件箱），与现状一致。
- `useTaskRowSelection` 改用 URL 派生后，spec 中"列表级瞬态用 useState"的措辞需在 3.3 更新为：expandedId 改由 URL 派生。

## 9. 兼容性/回归

- 后端 `CreateTaskDto.title` 仅 `@IsString()`，允许占位"新任务"，无需后端改动。
- `TaskItem` / `TaskList` 仅消费 `expandedId` 字符串，签名不变。
- `useTaskRowSelection` 返回结构不变，调用点无需改。