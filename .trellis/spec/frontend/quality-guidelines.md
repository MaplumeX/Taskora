# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

前端代码质量标准。所有代码必须通过 `pnpm lint` 和 `pnpm typecheck`。

## Monorepo 约定

- 包名统一用 `@taskora/*` 命名空间
- 包间依赖用 `"workspace:*"` 协议
- TS 配置继承根 `tsconfig.base.json`：`"extends": "../../tsconfig.base.json"`

---

## Forbidden Patterns

### 重复定义 DTO 类型

禁止在前端定义与 `@taskora/shared` 重复的 DTO。所有 DTO 必须从 shared 引用。

### 根目录直接安装依赖

禁止在根 `package.json` 安装业务依赖。仅 dev 工具可放根。

---

## Required Patterns

### 组件
- 组件文件用 `PascalCase.tsx`（如 `TaskItem.tsx`、`AppShell.tsx`）
- **导出方式分两类**：
  - 页面组件（`src/pages/`）：`export default function Xxx()`（默认导出，供路由文件直接 `import Xxx from '@/pages/...'`）
  - 复用组件（`src/components/`）：`export function Xxx()`（命名导出，`import { Xxx } from '@/components/...'`）
- 各业务域目录（`task/`、`project/`、`area/`、`layout/`、`ui/`）下**无** `index.ts` barrel，一律按相对路径导入具体文件
- shadcn/ui 基础组件放 `src/components/ui/`，不修改其内部实现，只通过 `className` 覆盖
- 条件类名用 `cn()`（`src/lib/utils.ts`），不手写字符串拼接

### 类型
- DTO / 枚举从 `@taskora/shared` 引用：`import type { CreateTaskDto } from '@taskora/shared'`
- 路径别名用 `@/`（已在 `vite.config.ts` 和 `tsconfig.json paths` 配置），不写 `../../` 相对深层路径

### 数据获取
- 服务端数据全部走 TanStack Query，不在 Zustand 缓存服务端数据
- Query key 遵循 `[domain, scope, params]` 约定（见 hook-guidelines.md）
- mutation `onSuccess` 必须 invalidate 相关 query key

### 路由
- 路由用 `react-router-dom` v6 data routers（`createBrowserRouter`），路由表集中定义在 `src/router.tsx`，在 `main.tsx` 用 `<RouterProvider router={router} />` 挂载
- 鉴权与布局通过嵌套 layout route 实现：`<ProtectedRoute />` 作为外层 `element`，其下嵌套 `<AppShell />`，再嵌套各业务页面，避免逐页套包裹组件

```tsx
// src/router.tsx
export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, path: '/', element: <Navigate to="/today" replace /> },
          { path: '/inbox', element: <Inbox /> },
          { path: '/today', element: <Today /> },
          { path: '/upcoming', element: <Upcoming /> },
          { path: '/anytime', element: <Anytime /> },
          { path: '/someday', element: <Someday /> },
          { path: '/logbook', element: <Logbook /> },
          { path: '/projects/:id', element: <ProjectDetail /> },
          { path: '/areas/:id', element: <AreaDetail /> },
          { path: '/tags', element: <Tags /> },
          { path: '/tags/:tagId', element: <TagDetail /> },
          { path: '/trash', element: <Trash /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
```

`ProtectedRoute` 读 `useAuthStore` 的 `token` / `refreshing`：有 token 放行；无 token 但 `refreshing` 为 true 时返回 null（等启动恢复）；否则重定向 `/login`。

---

## Testing Requirements

### 测试运行器：Vitest + Testing Library

- 前端用 vitest（`packages/frontend/vitest.config.ts`），环境为 jsdom
- 组件测试用 `@testing-library/react` + `@testing-library/jest-dom`（自定义 matcher 如 `toHaveAttribute`、`toBeDisabled`）
- 全局 setup：`src/test/setup.ts` → `import '@testing-library/jest-dom/vitest'`
- tsconfig.json `types` 需包含 `"vitest/globals"` 和 `"@testing-library/jest-dom"`，否则 jest-dom matcher 类型不可用

### 测试文件命名约定

| 类型 | 命名 | 位置 |
|------|------|------|
| Hook 测试 | `*.test.ts` | `src/lib/hooks/` |
| 组件测试 | `*.test.tsx` | 紧邻组件文件 |

### Hook 测试约定

- `vi.mock('@/lib/api/xxx.api')` mock API 模块
- 用 `@tanstack/react-query` 的 `QueryClient` + `QueryClientProvider` wrapper 包裹（`renderHook` 需 QueryClient 上下文）
- wrapper 工厂：创建 `QueryClient`（`retry: false`），返回 `QueryClientProvider` 包裹函数
- 由于 hook 测试文件为 `.ts`（非 `.tsx`），wrapper 中使用 `React.createElement` 而非 JSX

### 组件测试约定

- 用 `render()` + `screen.getByRole()` / `screen.getByText()` 查询
- 事件用 `@testing-library/user-event` 或 `fireEvent`（简单点击可用 `fireEvent`）
- 测试组件纯展示逻辑（props 驱动），不直接测试 TanStack Query mutation（在 hook 测试中覆盖）

### 质量门

- `pnpm lint` + `pnpm typecheck` + `pnpm test` 必须全部通过
- 添加新 hook 时建议同步编写 `*.test.ts`
- 添加新复用组件时建议同步编写 `*.test.tsx`

---

## Code Review Checklist

- [ ] DTO 从 `@taskora/shared` 引用，不重复定义
- [ ] TanStack Query key 符合约定（`['tasks', { view }]`）
- [ ] 变更后 invalidate 相关 query
- [ ] `pnpm lint` 和 `pnpm typecheck` 通过
