# Directory Structure

> How frontend code is organized in this project.

---

## Overview

前端代码位于 `packages/frontend/`，使用 React + Vite + TypeScript。按功能分层：pages（路由页面）、components（UI 组件）、lib（工具与 API 层）。

---

## Directory Layout

```
packages/frontend/
├── package.json          # @taskora/frontend, dep @taskora/shared: workspace:*
├── tsconfig.json         # extends ../../tsconfig.base.json
├── vite.config.ts        # Vite 配置
├── tailwind.config.js    # Tailwind 配置
└── src/
    ├── main.tsx           # 入口（挂载 RouterProvider）
    ├── router.tsx        # 路由配置（createBrowserRouter）
    ├── lib/
    │   ├── api/           # API 封装（axios 实例 + 各资源 API）
    │   │   ├── client.ts
    │   │   ├── auth.api.ts
    │   │   ├── tasks.api.ts
    │   │   ├── projects.api.ts
    │   │   └── areas.api.ts
    │   ├── hooks/         # TanStack Query hooks
    │   │   ├── useTasks.ts
    │   │   ├── useAuth.ts
    │   │   ├── useProjects.ts
    │   │   └── useAreas.ts
    │   ├── stores/        # Zustand stores
    │   │   └── auth.store.ts
    │   └── utils/
    ├── components/
    │   ├── ui/            # shadcn/ui 组件
    │   ├── layout/        # 布局（AppShell, Sidebar, MainContent）
    │   ├── task/          # 任务相关组件
    │   ├── project/       # 项目相关组件
    │   └── area/          # 区域相关组件
    └── pages/
        ├── Login.tsx
        ├── Register.tsx
        ├── Inbox.tsx
        ├── Today.tsx
        ├── Upcoming.tsx
        ├── Anytime.tsx
        ├── Someday.tsx
        ├── Projects.tsx
        ├── ProjectDetail.tsx
        ├── Areas.tsx
        ├── AreaDetail.tsx
        └── Trash.tsx
```

---

## Module Organization

- **pages/**：路由页面组件，每个路由一个文件
- **components/**：可复用 UI 组件，按业务域分组（task/project/area），跨域组件放 layout/
- **lib/api/**：API 调用封装，每个资源一个文件，类型从 `@taskora/shared` 引用
- **lib/hooks/**：TanStack Query hooks，封装数据获取与变更逻辑
- **lib/stores/**：Zustand stores，仅放客户端 UI 状态（如 auth token）

### 状态管理分层

| 层 | 工具 | 存什么 |
|---|---|---|
| 服务端状态 | TanStack Query | tasks、projects、areas（缓存、失效、重请求） |
| 客户端 UI 状态 | Zustand | auth（token）、UI 开关 |
| URL 状态 | React Router | 当前视图、选中资源 id |

---

## Naming Conventions

- 文件：`PascalCase`（组件，如 `TaskItem.tsx`）或 `kebab-case`（非组件，如 `auth.api.ts`、`auth.store.ts`）
- 组件：`PascalCase`（如 `TaskItem`、`AppShell`）
- Hooks：`use` 前缀（如 `useTasks`、`useAuth`）
- API 函数：动词 + 资源（如 `getTasks`、`createTask`）

---

## Common Mistakes

### API 类型不从 shared 引用

**Symptom**: 前端 DTO 定义与后端不一致，API 调用时类型错误

**Cause**: 在前端自行定义 DTO 类型，而非从 shared 包引用

**Fix**:

```typescript
// Correct
import { CreateTaskDto, TaskResponseDto } from '@taskora/shared';

// Wrong
interface CreateTaskDto { title: string; ... }  // 重复定义
```

**Prevention**: 禁止在前端定义与 shared 包重复的 DTO 类型。

---

## Examples

- 目录结构来源：`.trellis/tasks/07-25-gtd-app/design.md` §5.1