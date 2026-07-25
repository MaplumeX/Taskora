# Frontend Core - Technical Design

## 概述

搭建 React 前端基础架构：Vite 脚手架、Tailwind + shadcn/ui、路由、认证流程、API 联调层。

参考 parent design.md §5（前端架构）。

## 技术要点

- Vite + React 18 + TypeScript
- Tailwind CSS v4（或 v3 视 shadcn/ui 兼容性）
- shadcn/ui 组件库
- React Router v6（data router 或 createBrowserRouter）
- Axios（HTTP 客户端）
- Zustand（auth store）
- TanStack Query v5（服务端状态）

## 目录结构

见 parent `design.md` §5.1。

## 路由

见 parent `design.md` §5.2。受保护路由用 ProtectedRoute 包裹。

## 状态管理

见 parent `design.md` §5.3-5.4。三层：TanStack Query（服务端）、Zustand（auth）、React Router（URL）。

## API 联调

- baseURL 从 `import.meta.env.VITE_API_URL` 读取，默认 `http://localhost:3000`
- 请求拦截器附加 JWT
- 401 响应清除 auth store 并跳转 /login
- API 函数类型从 @taskora/shared 引用

## 认证流程

- 登录页：邮箱 + 密码 → POST /auth/login → 存 token + user → 跳转 /today
- 注册页：邮箱 + 密码 + 确认 → POST /auth/register → 跳转 /login
- ProtectedRoute：检查 auth store，无 token → /login
- 登出：清除 store → 跳转 /login