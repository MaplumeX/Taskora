# Refactor UI state: move expand/selected out of URL into store

## Goal

放宽 `state-management` 规范措辞为"Zustand 用于跨组件 UI 态；禁止缓存服务端数据"，新增 UI store 收编 `expandedId`、一次性导航指令 `editTitle`、主题 `theme`，把 URL 还原为只承载真正可分享/可书签的状态（视图、路由 id）。

## Background

当前 `state-management.md` 把 Zustand 收紧到"仅放 auth/token"，导致三处 UI 状态外溢到不恰当的载体，各有代价：

| 状态 | 现状载体 | 代价 |
|---|---|---|
| `expandedId`（任务行展开） | URL `?expand=<id>` | URL 污染、刷新态残留、类型不安全（`string \| null`） |
| `editTitle`（创建后自动进入标题编辑） | router `location.state` | `as` 断言、无编译期契约、刷新即丢 |
| `theme`（light/dark/system） | 自定义 hook + 手写 localStorage | 跨组件广播需要穿 props，与主流社区实践偏离 |

根因是规范措辞从"别在 Zustand 缓存服务端数据"外溢成"Zustand 只放 auth/token"，把合理的跨组件 UI store 一起禁了。

## Requirements

### R1 — 规范措辞放宽
- `state-management.md`：Zustand 适用范围从"仅 auth/token"扩展为"auth + 跨组件 UI 非持久态 + 主题等需持久 UI 偏好"。
- 明确"禁止在 Zustand 缓存服务端数据"作为不可逾越的红线保留。
- 同步修正 `directory-structure.md`、`component-guidelines.md`、`hook-guidelines.md`、`quality-guidelines.md` 中引用该约束的措辞。

### R2 — `expandedId` 迁出 URL 进 store
- 新增 UI store（Zustand，非持久），持有 `expandedId: string | null`。
- `useTaskRowSelection` 改为从 store 读写，不再使用 `useSearchParams`。
- `ContentBottomBar` 创建任务后设 `expandedId = created.id` 驱动列表展开。
- `selectedId` 保持各页面 `useState`（页面级瞬态，业界共识允许，非本任务目标）。
- **行为变化**：刷新后展开态丢失（用户已确认接受）。
- URL 中不再出现 `?expand=` 参数。

### R3 — `editTitle` 一次性指令迁入 store
- UI store 持有 `pendingAutoEditId: string | null`。
- `SidebarBottomBar` 创建 project/area 后设 `pendingAutoEditId = created.id` 再 navigate。
- `ProjectDetail` / `AreaDetail` 读 `pendingAutoEditId === routeId` 派生 `autoEdit`，进入编辑后（`InlineTitleEdit` mount 后）清除该字段，避免残留触发重复编辑。
- 移除 `location.state as { editTitle?: boolean }` 类型断言。

### R4 — `useTheme` 迁入 store
- 新增 theme store（Zustand + `persist` 中间件，localStorage key 保持 `taskora-theme`）。
- store action `setMode` / `cycle` 内部触发 `applyTheme` 副作用（DOM class 同步）。
- `main.tsx` 保留同步 `applyThemeFromStorage()` 调用避免 FOUC（从 localStorage 读，与 store 初始化解耦）。
- `SidebarBottomBar` 改为从 theme store 消费 `mode` / `cycle`。

### R5 — 清理与回归
- 删除/简化因迁移产生的死代码（如 `useTaskRowSelection` 内的 `useSearchParams` 调用、`useTheme` 旧 hook 中被 store 取代的逻辑）。
- 保留 `useTaskRowSelection` / `useTheme` 作为对组件的稳定 API（内部委托 store），避免大范围改动消费方。

## Out of Scope

- `selectedId` 的跨视图共享（当前各页面独立 `useState`，保持不变）。
- 侧栏折叠、命令面板等尚未存在的 UI 状态的新建。
- 后端 API、数据模型变化。

## Acceptance Criteria

- [ ] AC1：URL 中不再出现 `?expand=` 参数；展开/折叠任务行正常工作。
- [ ] AC2：`ContentBottomBar` 添加任务后新行自动展开。
- [ ] AC3：`ProjectDetail` / `AreaDetail` 创建后自动进入标题编辑，刷新页面不重复触发编辑。
- [ ] AC4：主题切换（light/dark/system）即时生效，刷新后保持，无 FOUC。
- [ ] AC5：`state-management.md` 及关联 spec 文件措辞一致表达"Zustand 用于跨组件 UI 态，禁止缓存服务端数据"。
- [ ] AC6：`pnpm -F frontend typecheck`、`pnpm -F frontend lint`、`pnpm -F frontend build` 全部通过。
- [ ] AC7：无 `as { editTitle?: boolean }` 类型断言残留。
