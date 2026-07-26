# Design — Refactor UI state out of URL

## 概述

新增两个 Zustand store，迁移三处 UI 状态：
- `uiInteraction.store.ts`（非持久）：`expandedId`、`pendingAutoEditId`
- `theme.store.ts`（持久 + 副作用）：`mode`、`resolved`、`setMode`、`cycle`

`useTaskRowSelection.ts` / `useTheme.ts` 保留为对外 hook API，内部委托 store，消费方零改动。

## 文件清单

### 新增
- `packages/frontend/src/lib/stores/uiInteraction.store.ts`
- `packages/frontend/src/lib/stores/theme.store.ts`

### 修改
- `packages/frontend/src/lib/hooks/useTaskRowSelection.ts` — 去掉 `useSearchParams`，改读 `uiInteractionStore.expandedId`
- `packages/frontend/src/components/layout/ContentBottomBar.tsx` — `setParams({ expand })` → `uiInteractionStore.setExpandedId(id)`
- `packages/frontend/src/lib/hooks/useTheme.ts` — 委托 `theme.store`，保留 `applyTheme` / `applyThemeFromStorage` 导出供 `main.tsx` 用
- `packages/frontend/src/components/layout/SidebarBottomBar.tsx` — `navigate(..., { state: { editTitle } })` → `setPendingAutoEditId(id)`；`useTheme()` 调用不变（hook 内部已委托）
- `packages/frontend/src/pages/ProjectDetail.tsx` — 读 `pendingAutoEditId === id`，mount 后清除
- `packages/frontend/src/pages/AreaDetail.tsx` — 同上
- `.trellis/spec/frontend/state-management.md` — 规范放宽
- `.trellis/spec/frontend/directory-structure.md` — `stores/` 说明扩充
- `.trellis/spec/frontend/component-guidelines.md` — `useTaskRowSelection` 段落更新
- `.trellis/spec/frontend/hook-guidelines.md` — 客户端状态说明更新
- `.trellis/spec/frontend/quality-guidelines.md` — 一致性核对

## 设计决策

### D1：拆两个 store 而非一个

`uiInteraction`（非持久、内存态）与 `theme`（持久 + DOM 副作用 + matchMedia listener）职责差异大：
- 持久化策略不同（一个不持久，一个 `persist` 中间件）
- theme store 需要处理 SSR/FOUC 边界（`main.tsx` 同步 apply）
- 分开后每个 store 单一职责，符合 spec 对 store 的粒度期望

### D2：`expandedId` 全局单一 vs 按页面分片

当前 `expandedId` 经 URL 已是全局单一（刷新后所有页面共享同一个展开 id）。迁到 store 保持全局单一，行为等效。不同页面展示不同任务集，若 id 不在新页面列表中则自然无行匹配，UI 空闲，无需特殊处理。

`selectedId` 保持各页面 `useState`（页面级瞬态，不跨页共享），不进 store。

### D3：`pendingAutoEditId` 的"消费即清"约定

`SidebarBottomBar` 创建后 set id → navigate → 目标页 mount 时读 `pendingAutoEditId === routeId` → `InlineTitleEdit` 受控进入编辑态 → 目标页在 mount 后的 `useEffect` 中 `clearPendingAutoEditId()`。

清除时机：放进 `ProjectDetail` / `AreaDetail` 的 `useEffect(() => clear(), [])`，保证只触发一次，刷新页面不会重复编辑（因为 store 非持久，刷新后 `pendingAutoEditId` 为 null）。

### D4：theme store 的副作用承载

`theme.store.ts` 的 `setMode` / `cycle` action 内部直接调用 `applyTheme(mode)` 同步 DOM class，再写 state。`matchMedia` listener 在 store 模块顶层注册（模块加载时一次），监听系统主题变化时若 `mode === 'system'` 则重算 `resolved` 并 apply。

`main.tsx` 保留 `applyThemeFromStorage()` 同步调用——它在 React 渲染前从 localStorage 读 mode 并 apply，避免 FOUC。store 初始化时也从 localStorage 读初值（persist 中间件处理），与 `main.tsx` 的同步 apply 形成双保险。

### D5：保留 hook 作为稳定 API

`useTaskRowSelection` / `useTheme` 仍是对外 API：
- `useTaskRowSelection`：内部 `useUiInteractionStore`，继续返回 `{ selectedId, expandedId, handleRowClick, handleBlankClick }`，消费方（`TaskListView` / `Logbook` / `Upcoming`）零改动。
- `useTheme`：内部 `useThemeStore`，继续返回 `{ mode, resolved, setMode, cycle }`，`SidebarBottomBar` 零改动。

这样 store 重构的 blast radius 限制在 store + hook + 两个 detail 页 + ContentBottomBar，消费层不动。

## 数据流

```
内容栏创建任务
  └─ uiInteractionStore.setExpandedId(created.id)
       └─ TaskListView 读 store.expandedId → 匹配行展开

侧栏创建 project/area
  └─ uiInteractionStore.setPendingAutoEditId(created.id)
  └─ navigate(/projects/:id)
       └─ ProjectDetail mount
            └─ autoEdit = pendingAutoEditId === id
            └─ useEffect: clearPendingAutoEditId()
            └─ InlineTitleEdit autoFocusAndSelect={autoEdit}

主题切换
  └─ themeStore.cycle() → applyTheme(newMode) + set state + persist→localStorage
  └─ SidebarBottomBar 读 store.mode → 图标更新
```

## 兼容性 / 回滚

- 行为变化：刷新后展开态丢失（用户已确认接受）。
- localStorage key `taskora-theme` 不变，老数据兼容。
- 回滚点：每个 store 独立迁移，可按 store 粒度 revert。spec 措辞与代码同 commit，避免规范与实现脱节。
