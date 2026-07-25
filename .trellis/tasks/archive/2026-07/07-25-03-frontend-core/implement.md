# Frontend Core - Execution Plan

## Checklist

### 1. Vite + React 初始化
- [ ] 在 `packages/frontend` 初始化 Vite React TS 项目
- [ ] 配置 vite.config.ts（路径别名 @ → src/）
- [ ] 安装 React 18 + react-dom

### 2. Tailwind CSS
- [ ] 安装 tailwindcss + postcss + autoprefixer
- [ ] 配置 tailwind.config.js（content paths, theme extend for Things3 colors）
- [ ] 配置 postcss.config.js
- [ ] src/index.css：@tailwind directives
- [ ] Things3 配色变量（parent design.md §6.1）

### 3. shadcn/ui
- [ ] 初始化 shadcn/ui（components.json）
- [ ] 安装基础组件：Button, Input, Label, Dialog, DropdownMenu, Checkbox, Separator, ScrollArea
- [ ] 配置 cn() 工具函数（lib/utils.ts）

### 4. 路由
- [ ] 安装 react-router-dom
- [ ] 配置路由表（见 design.md §5.2）
- [ ] ProtectedRoute 组件
- [ ] App.tsx：RouterProvider 或 Outlet 布局

### 5. API 层
- [ ] 安装 axios
- [ ] lib/api/client.ts：axios 实例 + 拦截器（JWT、401 跳转）
- [ ] lib/api/auth.api.ts：register, login, getMe
- [ ] lib/api/tasks.api.ts：getTasks, getTask, createTask, updateTask, deleteTask, restoreTask, completeTask, uncompleteTask
- [ ] lib/api/projects.api.ts：CRUD
- [ ] lib/api/areas.api.ts：CRUD
- [ ] 所有函数参数/返回类型从 @taskora/shared 引用

### 6. 状态管理
- [ ] 安装 zustand
- [ ] lib/stores/auth.store.ts：token, user, login(), logout(), isAuthenticated
- [ ] token 持久化到 localStorage

### 7. TanStack Query
- [ ] 安装 @tanstack/react-query
- [ ] 配置 QueryClient（见 design.md §5.4）
- [ ] QueryClientProvider 在 App.tsx

### 8. Hooks（基础）
- [ ] lib/hooks/useAuth.ts：useLogin, useRegister, useCurrentUser, useLogout
- [ ] lib/hooks/useTasks.ts：useTasksQuery(view), useCreateTask, useUpdateTask, useDeleteTask
- [ ] lib/hooks/useProjects.ts：useProjectsQuery, useCreateProject, useUpdateProject, useDeleteProject
- [ ] lib/hooks/useAreas.ts：useAreasQuery, useCreateArea, useUpdateArea, useDeleteArea
- [ ] Query key 约定见 design.md §5.4
- [ ] 变更后 invalidateQueries

### 9. 页面与布局
- [ ] Login.tsx：邮箱+密码表单，提交调 useLogin
- [ ] Register.tsx：邮箱+密码+确认密码，提交调 useRegister
- [ ] AppShell.tsx：侧边栏 + 主内容区
- [ ] Sidebar.tsx：导航项（Inbox/Today/Upcoming/Anytime/Someday/Projects/Areas/Trash），图标 + 文字
- [ ] MainContent.tsx：页面 Outlet
- [ ] 各视图页面占位（仅标题，实际实现在 04-frontend-views）

### 10. 配置
- [ ] .env：VITE_API_URL=http://localhost:3000
- [ ] package.json scripts：dev, build, lint, typecheck

### 11. Validation
- [ ] `pnpm --filter frontend lint` 通过
- [ ] `pnpm --filter frontend typecheck` 通过
- [ ] `pnpm --filter frontend dev` 启动成功
- [ ] 登录页可见且可提交
- [ ] 注册页可见且可提交
- [ ] 未登录访问 /today 跳转 /login
- [ ] AppShell 布局可见

## Rollback Points
- 脚手架错误：删除 src/ 重新初始化
- shadcn/ui 配置问题：重新 init