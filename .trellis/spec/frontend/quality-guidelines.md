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
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/inbox', element: <Inbox /> },
          // ...
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
```

---

## Testing Requirements

**当前状态**：项目尚未建立测试套件。
- `packages/frontend/package.json` 无 `test` 脚本
- 无 `*.spec.tsx` / `*.test.tsx` 文件，无 Vitest/Jest/Testing Library 依赖
- 质量门目前依赖：`pnpm lint` + `pnpm typecheck`（根 `package.json`）

> 未来引入测试时再更新本节。在此之前的约定：
- 组件保持纯展示与数据获取分离（如 `TaskListView` 取数据、`TaskList` 渲染），便于后续单测
- 不为追求覆盖率而临时补测试

---

## Code Review Checklist

- [ ] DTO 从 `@taskora/shared` 引用，不重复定义
- [ ] TanStack Query key 符合约定（`['tasks', { view }]`）
- [ ] 变更后 invalidate 相关 query
- [ ] `pnpm lint` 和 `pnpm typecheck` 通过
