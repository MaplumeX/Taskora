# State Management

> How state is managed in this project.

---

## Overview

三层状态管理：

| 层 | 工具 | 存什么 |
|---|---|---|
| 服务端状态 | TanStack Query | tasks、projects、areas（缓存、失效、重请求） |
| 客户端 UI 状态 | Zustand | auth、跨组件 UI 态（展开/选中/一次性指令）、主题等需持久 UI 偏好 |
| URL 状态 | React Router | 当前视图、选中资源 id |

---

## State Categories

### 服务端状态（TanStack Query）

- 所有 API 数据通过 TanStack Query 管理
- 不在 Zustand 中缓存服务端数据
- Query key 是缓存唯一标识（见 hook-guidelines.md）

### 客户端 UI 状态（Zustand）

Zustand 用于跨组件、非服务端的客户端 UI 状态。按是否需要持久化分两类：

- **持久类**（`persist` 中间件 + localStorage）：
  - `auth.store.ts`：`token`（内存态，不持久化）、`user`（持久化）、`refreshing`（内存态）。`partialize` 只持久化 `{ user }`——token 不持久化，刷新后靠启动恢复 silent refresh 获取新 token
  - `theme.store.ts`：主题 `mode`（light/dark/system）；action 内部触发 `applyTheme` 同步 DOM class，模块顶层注册 `matchMedia` listener
  - `projectUiPrefs.store.ts`：项目详情页 UI 偏好，按 `projectId` 存储独立展开状态（`completedPanelExpanded: Record<string, boolean>`），消费方传 `projectId` 读取
- **非持久类**（内存态，刷新即失）：
  - `uiInteraction.store.ts`：`expandedId`（任务行展开）、`pendingAutoEditId`（创建后自动进入标题编辑的一次性指令）

**红线**：服务端数据（tasks、projects、areas 等）一律走 TanStack Query，禁止在 Zustand 缓存。这条不可逾越。

```typescript
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      refreshing: false,
      setAuth: (token, user) => set({ token, user }),
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      setRefreshing: (refreshing) => set({ refreshing }),
      clear: () => set({ token: null, user: null, refreshing: false }),
    }),
    {
      name: 'taskora-auth',
      partialize: (state) => ({ user: state.user }),  // 只持久化 user，不持久化 token
    },
  ),
);
```

### Token 不持久化 + 启动恢复

**Why**：access token 短期有效，持久化后刷新页面会拿到过期 token，不如从内存态 + silent refresh 重新获取。

**Recovery 流程**（`main.tsx`）：

```typescript
async function tryRecoverSession() {
  const { user, token, setAuth, clear, setRefreshing } = useAuthStore.getState();
  if (token || !user) return;  // 有 token 或无 user 快照都不恢复
  setRefreshing(true);
  try {
    const data = await refresh();  // 调 POST /auth/refresh，靠 HttpOnly cookie
    setAuth(data.accessToken, data.user);
  } catch {
    clear();
  } finally {
    setRefreshing(false);
  }
}
```

`ProtectedRoute` 读 `refreshing` 标志：token 为空但 `refreshing` 为 true 时返回 `null`（等待恢复完成），避免恢复期间闪烁登录页。

### Axios 401 自动刷新拦截器

`lib/api/client.ts` 的 response 拦截器处理 access token 过期：

- 401 且非 `/auth/refresh` 请求 → `isRefreshing` 标志进入刷新流程，调 `/auth/refresh`，成功后重放原请求 + 排队中的请求
- 刷新失败 → `useAuthStore.clear()` + 重定向 `/login`
- `/auth/refresh` 本身返回 401 → 直接 clear，不重试（避免无限循环）
- 并发 401 请求进入 `waitingQueue`，刷新成功后依次重放
```

### URL 状态（React Router）

- 当前视图（/inbox, /today 等）
- 选中的 project/area id（/projects/:id）
- 用 `useParams`、`useNavigate` 读写

---

## When to Use Global State

- 需要跨组件共享的客户端状态 → Zustand（持久类用 `persist`，瞬态类纯内存）
- 仅组件内部的状态 → useState
- 服务端数据 → TanStack Query（不要放 Zustand）
- UI 偏好类持久状态（主题等）→ Zustand + `persist`（见 `theme.store.ts`）

### 持久 UI 偏好：store + persist

**What**：主题（light/dark/system）、每周起始日等需持久化的 UI 偏好放入 Zustand + `persist` 中间件。

**Why**：这类状态需跨组件广播、刷新保持、外部副作用（DOM class、matchMedia listener）。store 将副作用收敛在 action 内，消费方只读 state。比手写 `useEffect` + localStorage 更直白，也避免每个消费点重复订阅。

**Example**：`theme.store.ts`——
- `mode` / `resolved` 为 state；`setMode` / `cycle` action 内部调 `applyTheme` 同步 DOM
- `persist` + `partialize: { mode }`，localStorage key 用项目前缀 `taskora-theme`
- 模块顶层注册 `matchMedia` listener 一次
- `main.tsx` 在 React 渲染前同步调用 `applyThemeFromStorage()` 避免 FOUC（该函数从 localStorage 直读并 apply，与 store 初始化解耦）

### 偏好跨端同步：localStorage 快速层 + 后端同步层

**What**：用户偏好（theme / language / weekStartsOn）采用双层存储——localStorage 作为前端快速层（避免 FOUC、即时生效），后端 `User.preferences`（`Json?`）作为跨端同步层。

**Why**：主题和语言在页面加载早期就要生效（避免 FOUC），localStorage 保证即时应用；后端 `preferences` 保证换设备后偏好同步过来。纯后端方案会在 API 返回前闪烁。

**Stores**：
- `theme.store.ts`：主题 mode（localStorage key `taskora-theme`）
- `preferences.store.ts`：weekStartsOn（localStorage key `taskora-week-starts`）；同时导出独立 `hydrateFromServer()` 函数供非 React 代码调用
- 语言：i18next browser detector 自动持久化（localStorage key `taskora-lang`）

**Hydrate 时机（关键）**：`hydrateFromServer(prefs)` 必须在三条路径都触发，否则偏好只在特定页面才同步：
1. **登录**：`useLogin` 的 `onSuccess` 中 `setAuth` 后调 `hydrateFromServer(data.user.preferences ?? null)`
2. **Session recovery**：`main.tsx` 的 `tryRecoverSession` 中 `setAuth` 后调 `hydrateFromServer(data.user.preferences ?? null)`
3. **useCurrentUser**：`useEffect` 监听 `query.data?.id` 变化时调（只在 user.id 变化时跑，避免 refetch 循环）

**Hydrate 行为**：`prefs` 非 null 时覆盖 localStorage（theme/language/weekStartsOn）；`prefs` 为 null 时不覆盖（保持 localStorage 现有值，不强制回默认值）。

**偏好变更流程**：用户改偏好 → 先更新 localStorage（即时生效）→ 异步 `PUT /users/me/preferences` 同步后端。同步失败 toast 提示，不回滚本地（本地已生效，回滚会闪）。

### 一次性导航指令：store 内存态

**What**：创建 project/area 后需驱动目标页进入标题编辑，用 `uiInteractionStore.pendingAutoEditId`（内存态）承载，而非 router `location.state`。

**Why**：`location.state` 需要 `as` 断言强转，无编译期契约。store 字段类型安全，且非持久特性正好满足

---

## Common Mistakes

### 在 Zustand 缓存服务端数据

**Symptom**：任务列表数据在多个地方手动同步，容易不一致

**Fix**：服务端数据只用 TanStack Query，Zustand 仅管理 auth、跨组件 UI 态、主题等客户端状态。

### Logout 时不清除 Query 缓存

**Symptom**：登出后登录另一个用户，看到上一个用户的缓存数据

**Fix**：logout 时调 `queryClient.clear()` 清除所有缓存。