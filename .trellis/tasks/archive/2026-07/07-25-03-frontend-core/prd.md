# Frontend Core

## Goal

搭建 React 前端基础架构：脚手架、路由、认证流程、API 联调层，为视图实现提供可运行的基础。

## Background

- Parent task: `07-25-gtd-app`
- 依赖 `01-monorepo-setup` 完成
- 技术栈：React + Vite + TypeScript + Tailwind CSS + shadcn/ui + Zustand + TanStack Query
- 可与 `02-backend-core` 并行开发（API 契约从 `shared` 包获取）

## Requirements

### 项目脚手架

- React + Vite + TypeScript 项目初始化在 `packages/frontend`
- Tailwind CSS 配置
- shadcn/ui 初始化（添加 Button、Input、Dialog、DropdownMenu 等基础组件）
- React Router 路由配置

### 认证流程

- 登录页：邮箱 + 密码
- 注册页：邮箱 + 密码 + 确认密码
- 认证状态管理（Zustand store 存储 token 与用户信息）
- 路由守卫：未登录跳转到登录页
- 登出功能

### API 联调层

- Axios 或 fetch 封装，baseURL 指向后端
- 请求拦截器自动附加 JWT token
- 401 响应自动跳转登录页
- TanStack Query 配置（QueryClient、默认 staleTime 等）
- 封装 auth 和 tasks 的 API 调用函数（类型从 `shared` 包引用）

### 基础布局

- 应用 shell：侧边栏（导航占位）+ 主内容区
- 侧边栏导航项占位（Inbox/Today/Upcoming/Anytime/Someday/Projects/Areas/Trash）
- 响应式布局基础

## Acceptance Criteria

- [ ] `pnpm dev` 启动前端开发服务器成功
- [ ] Tailwind CSS 生效（样式正常加载）
- [ ] shadcn/ui 组件可用
- [ ] 注册页可提交注册请求
- [ ] 登录页可提交登录请求并存储 token
- [ ] 未登录访问受保护路由时跳转登录页
- [ ] 登出后 token 清除并跳转登录页
- [ ] API 封装可调用后端 auth 和 tasks 端点
- [ ] TanStack Query 正常工作（缓存、loading/error 状态）
- [ ] 应用 shell 布局可见（侧边栏 + 主内容区）

## Out of Scope

- Things3 视图的具体实现（`04-frontend-views`）
- 后端 API 实现（`02-backend-core`）
- 精细的视觉设计打磨

## Open Questions

- 无
