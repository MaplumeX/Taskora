# State Management

> How state is managed in this project.

---

## Overview

三层状态管理：

| 层 | 工具 | 存什么 |
|---|---|---|
| 服务端状态 | TanStack Query | tasks、projects、areas（缓存、失效、重请求） |
| 客户端 UI 状态 | Zustand | auth（token、user）、UI 开关 |
| URL 状态 | React Router | 当前视图、选中资源 id |

---

## State Categories

### 服务端状态（TanStack Query）

- 所有 API 数据通过 TanStack Query 管理
- 不在 Zustand 中缓存服务端数据
- Query key 是缓存唯一标识（见 hook-guidelines.md）

### 客户端 UI 状态（Zustand）

- `auth.store.ts`：token、user、`setAuth(token, user)`、`clear()`
- token 持久化到 localStorage（`persist` 中间件）
- `partialize` 只持久化必要字段

```typescript
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clear: () => set({ token: null, user: null }),
    }),
    {
      name: 'taskora-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
```

### URL 状态（React Router）

- 当前视图（/inbox, /today 等）
- 选中的 project/area id（/projects/:id）
- 用 `useParams`、`useNavigate` 读写

---

## When to Use Global State

- 需要跨页面共享的客户端状态 → Zustand
- 仅组件内部的状态 → useState
- 服务端数据 → TanStack Query（不要放 Zustand）
- UI 偏好类持久状态（主题等）→ 自定义 hook + localStorage（见下）

### UI 偏好类持久状态：用 hook，不进 Zustand

**What**：主题（light/dark/system）等 UI 偏好虽需持久化，但不放入 Zustand，而是用自定义 hook 管理。

**Why**：这类状态的核心副作用是操作 DOM class + localStorage + matchMedia listener，用 `useEffect` 在 hook 内管理最直接；引入 store 多一层间接。且该状态消费点极少（如主题切换器单点），不需要跨组件广播。Zustand 仅留给 auth/token 这类跨页面业务持久状态。

**Example**：`useTheme` hook（`src/lib/hooks/useTheme.ts`）：
- `useState` 存 `mode`，`useEffect` 同步 DOM class、写 localStorage、注册 matchMedia listener
- 导出独立的 `applyThemeFromStorage()` 供入口同步调用避免 FOUC
- localStorage key 用项目前缀：`taskora-theme`

---

## Common Mistakes

### 在 Zustand 缓存服务端数据

**Symptom**：任务列表数据在多个地方手动同步，容易不一致

**Fix**：服务端数据只用 TanStack Query，Zustand 仅管理 auth 等客户端状态。

### Logout 时不清除 Query 缓存

**Symptom**：登出后登录另一个用户，看到上一个用户的缓存数据

**Fix**：logout 时调 `queryClient.clear()` 清除所有缓存。