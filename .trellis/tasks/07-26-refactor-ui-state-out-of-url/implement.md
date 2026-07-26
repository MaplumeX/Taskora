# Implement — Refactor UI state out of URL

执行顺序按依赖从底层到上层，每步可独立验证。每步完成后跑 `pnpm -F frontend typecheck` 快速反馈。

## Step 1：新增 `uiInteraction.store.ts`

文件：`packages/frontend/src/lib/stores/uiInteraction.store.ts`

```ts
interface UiInteractionState {
  expandedId: string | null;
  pendingAutoEditId: string | null;
  setExpandedId: (id: string | null) => void;
  setPendingAutoEditId: (id: string | null) => void;
  clearPendingAutoEditId: () => void;
}
```

- 非持久（无 `persist` 中间件）。
- 两个 setter 用 `set({ expandedId: id })` / `set({ pendingAutoEditId: id })`。

验证：typecheck 通过。

## Step 2：新增 `theme.store.ts`

文件：`packages/frontend/src/lib/stores/theme.store.ts`

```ts
interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
  cycle: () => void;
}
```

- `create` + `persist`（`name: 'taskora-theme'`，`partialize: { mode }`）。
- 初值 `mode` 从持久化读（persist 处理），`resolved` 用 `resolveTheme(mode)` 派生。
- `setMode` / `cycle` 内部：`applyTheme(newMode)` 同步 DOM，再 set state + set resolved。
- 模块顶层注册 `matchMedia` listener（一次）：`mode === 'system'` 时重算 resolved 并 apply。
- 导出 `applyThemeFromStorage` 逻辑：从 localStorage 读 → apply，供 `main.tsx` 用（可从 `useTheme.ts` 重新导出或直接留在 hook 文件）。

验证：typecheck 通过；`main.tsx` 仍能 import `applyThemeFromStorage`。

## Step 3：`useTheme.ts` 委托 store

- 保留导出 `applyTheme`、`applyThemeFromStorage`、`ThemeMode`、`useTheme`。
- `useTheme` 内部 `const { mode, resolved, setMode, cycle } = useThemeStore()`，直接透传。
- 删除 hook 内的 `useState`、`useEffect`（DOM 同步、matchMedia listener）——这些已移入 store。

验证：typecheck + lint；手动验证主题切换、刷新保持、无 FOUC。

## Step 4：`useTaskRowSelection.ts` 委托 store

- 删除 `useSearchParams` import 与用法。
- `expandedId` 改为 `const expandedId = useUiInteractionStore(s => s.expandedId)`。
- `setExpandedId` 改为调用 `useUiInteractionStore` 的 `setExpandedId`。
- `selectedId` 保持 `useState`。

验证：typecheck；`?expand=` 不再出现在 URL。

## Step 5：`ContentBottomBar.tsx` 改用 store

- 删 `useSearchParams` import。
- 创建任务后 `uiInteractionStore.setExpandedId(created.id)`（通过 hook 或直接 `useUiInteractionStore`）。

验证：typecheck；添加任务后新行展开。

## Step 6：`SidebarBottomBar.tsx` + Detail 页改 autoEdit

`SidebarBottomBar`：
- `navigate('/projects/:id', { state: { editTitle: true } })` → `navigate('/projects/:id')` + `uiInteractionStore.setPendingAutoEditId(p.id)`。
- area 同理。

`ProjectDetail` / `AreaDetail`：
- 删 `useLocation` + `location.state as ...`。
- `const pendingAutoEditId = useUiInteractionStore(s => s.pendingAutoEditId)`。
- `const autoEdit = pendingAutoEditId === id`。
- 加 `useEffect(() => { if (autoEdit) clearPendingAutoEditId(); }, [autoEdit])`（消费即清，放 mount 后）。

验证：typecheck；创建 project/area 后自动进入标题编辑；刷新不重复触发。

## Step 7：更新 spec（5 个文件）

- `state-management.md`：表格"客户端 UI 状态"行扩展为"auth、跨组件 UI 态（选中/展开/一次性指令）、主题"；"UI 偏好类持久状态"段落重写为"主题等需持久 UI 偏好也可用 Zustand + persist，保持 localStorage key 约定"；Common Mistakes 红线保留。
- `directory-structure.md`：`stores/` 说明改为"auth + 跨组件 UI 状态 store"。
- `component-guidelines.md`：`useTaskRowSelection` 段落——`expandedId` 改述为"派生自 `uiInteractionStore`（Zustand）"，删除"不放入 Zustand"的措辞。
- `hook-guidelines.md`：客户端状态说明一致化。
- `quality-guidelines.md`：核对无矛盾措辞。

验证：grep `仅放 auth` / `不放入 Zustand` / `只放` 在 spec 下无残留矛盾。

## Step 8：全量验证

```bash
pnpm -F frontend typecheck
pnpm -F frontend lint
pnpm -F frontend build
```

## Validation Commands

- typecheck：`pnpm -F frontend typecheck`
- lint：`pnpm -F frontend lint`
- build：`pnpm -F frontend build`

## Rollback Points

- Step 1-2（store 新增）：独立，revert 文件即可。
- Step 3-6（hook + 消费方）：可按文件粒度 revert。
- Step 7（spec）：与代码改动同 commit，避免规范与实现脱节。

## Review Gates

- Step 6 完成后：人工跑一遍 UI（展开任务、添加任务、创建 project/area 自动编辑、主题切换）。
- Step 8 全绿后才算完成。
