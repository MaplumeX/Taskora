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
    ├── main.tsx           # 入口（i18n init + 主题 FOUC 防护 + 启动会话恢复 + QueryClient + RouterProvider）
    ├── router.tsx        # 路由配置（createBrowserRouter）
    ├── lib/
    │   ├── api/           # API 封装（axios 实例 + 401 自动 refresh 拦截器 + 各资源 API）
    │   │   ├── client.ts          # axios 实例 + request/response 拦截器（token 注入、401 刷新队列）
    │   │   ├── auth.api.ts        # register/login/refresh/logout/getMe
    │   │   ├── users.api.ts      # updateProfile/updatePassword
    │   │   ├── tasks.api.ts
    │   │   ├── projects.api.ts
    │   │   ├── areas.api.ts
    │   │   ├── tags.api.ts
    │   │   └── tag-groups.api.ts
    │   ├── hooks/         # TanStack Query hooks
    │   │   ├── useTasks.ts
    │   │   ├── useAuth.ts
    │   │   ├── useUsers.ts        # updateProfile/updatePassword mutations
    │   │   ├── useProjects.ts
    │   │   ├── useAreas.ts
    │   │   ├── useTags.ts
    │   │   ├── useTagGroups.ts
    │   │   ├── useTaskRowSelection.ts  # 列表级选中/展开状态委托 uiInteractionStore
    │   │   ├── usePageTaskContext.ts   # 路由→CreateTaskDto 上下文映射
    │   │   ├── useTheme.ts
    │   │   ├── useDebouncedValue.ts
    │   │   └── useDelayedLoading.ts
    │   ├── stores/        # Zustand stores（auth / theme / uiInteraction）
    │   │   ├── auth.store.ts           # token(内存) + user(持久) + refreshing
    │   │   ├── theme.store.ts          # 主题 mode + resolved + applyTheme 副作用
    │   │   └── uiInteraction.store.ts  # expandedId / pendingAutoEditId
    │   └── utils/         # 工具函数（utils.ts cn()、utils/date.ts 格式化、等）
    ├── i18n/              # 国际化（react-i18next）
    │   ├── config.ts      # i18next 实例配置（导出 i18n）
    │   └── locales/{zh,en}/*.json  # 按 namespace 切分的资源（9 个 namespace）
    ├── components/
    │   ├── ui/            # shadcn/ui 组件
    │   ├── common/        # 跨域通用组件（InlineTitleEdit）
    │   ├── layout/        # 布局（AppShell, Sidebar, SidebarBottomBar, MainContent, ContentBottomBar, SidebarProjectSection, SidebarAreaRow, SortableProjectItem, SortableAreaRow）
    │   ├── search/        # 搜索（SearchModal）
    │   ├── task/          # 任务相关组件
    │   ├── project/       # 项目相关组件
    │   ├── area/          # 区域相关组件
    │   └── ProtectedRoute.tsx  # 鉴权路由守卫（读 token/refreshing）
    └── pages/
        ├── Login.tsx
        ├── Register.tsx
        ├── Inbox.tsx
        ├── Today.tsx
        ├── Upcoming.tsx
        ├── Anytime.tsx
        ├── Someday.tsx
        ├── Logbook.tsx
        ├── ProjectDetail.tsx
        ├── AreaDetail.tsx
        ├── Tags.tsx
        ├── TagDetail.tsx
        ├── SettingsAccount.tsx
        └── Trash.tsx
```

---

## Module Organization

- **pages/**：路由页面组件，每个路由一个文件
- **components/**：可复用 UI 组件，按业务域分组（task/project/area/search），跨域组件放 common/，布局放 layout/
- **lib/api/**：API 调用封装，每个资源一个文件，类型从 `@taskora/shared` 引用；axios 拦截器集中放 `client.ts`
- **lib/hooks/**：TanStack Query hooks，封装数据获取与变更逻辑
- **lib/stores/**：Zustand stores，`auth.store`（token 内存态 + user 持久化 + refreshing 标志）、`theme.store`（主题）、`uiInteraction.store`（跨组件 UI 态）
- **components/ProtectedRoute.tsx**：鉴权路由守卫位于 components 根目录（非 layout/），读 `useAuthStore` 的 token/refreshing 决定渲染 Outlet / 等待 / 重定向 login

### 状态管理分层

| 层 | 工具 | 存什么 |
|---|---|---|
| 服务端状态 | TanStack Query | tasks、projects、areas（缓存、失效、重请求） |
| 客户端 UI 状态 | Zustand | auth、跨组件 UI 态（展开/选中/一次性指令）、主题 |
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