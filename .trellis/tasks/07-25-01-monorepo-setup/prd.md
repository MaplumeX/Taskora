# Monorepo Setup

## Goal

搭建 pnpm workspaces monorepo 基础结构，为后续 backend/frontend 开发提供可运行的基础设施。

## Background

- Parent task: `07-25-gtd-app`
- 没有已有代码库，从零开始
- 这是所有后续任务的前置依赖

## Requirements

- pnpm workspaces 配置（`pnpm-workspace.yaml`）
- `packages/shared` 包：共享类型（DTO、枚举、常量），可被前后端引用
- `packages/backend` 目录占位（空 NestJS 初始化在 `02-backend-core` 做）
- `packages/frontend` 目录占位（空 React Vite 初始化在 `03-frontend-core` 做）
- 根 `package.json` + `tsconfig.base.json`
- ESLint + Prettier 基础配置（根级，TypeScript 支持）
- `shared` 包导出至少一个示例类型，验证前后端可引用
- `.gitignore`（node_modules、dist、.env 等）

## Acceptance Criteria

- [ ] `pnpm install` 成功执行
- [ ] `packages/shared` 可被 `packages/backend` 和 `packages/frontend` 引用（import 成功）
- [ ] ESLint + Prettier 可运行（`pnpm lint`、`pnpm format`）
- [ ] TypeScript 类型检查通过（`pnpm typecheck` 或 `tsc --noEmit`）
- [ ] 目录结构符合 PRD 中定义的 monorepo 布局

## Out of Scope

- NestJS 项目初始化（`02-backend-core`）
- React Vite 项目初始化（`03-frontend-core`）
- 数据库配置
- 任何业务逻辑

## Open Questions

- 无
