# Taskora GTD Application

## Goal

开发一个仿 Things3 的 GTD（Getting Things Done）任务管理软件。数据以服务端为主，先交付 Web 端，未来扩展 Windows、macOS 等原生客户端。用户可在多设备间同步任务数据。

## Background

- 没有已有代码库，从零开始
- 参考产品：Cultured Code 的 Things3（macOS/iOS 上的经典 GTD 工具）
- 核心特点：优雅的 UI、收件箱驱动的收集流程、今日/未来/任意时间/某天的时间视角、项目与区域的结构化组织、任务层级（checklist）

## Requirements

### 技术约束

- 服务端为主的数据存储
- Web 端优先
- 未来支持多端原生客户端

### 技术栈（已确认）

| 层       | 选型                          | 理由                                                      |
| -------- | ----------------------------- | --------------------------------------------------------- |
| 后端     | Node.js + NestJS + TypeScript | 与前端共享类型契约；结构清晰、AI 生成友好                 |
| 数据库   | PostgreSQL + Prisma ORM       | 关系型适合任务层级/项目/区域结构；迁移与类型安全好        |
| API      | REST                          | MVP 够用、简单直接；多端客户端调用门槛低                  |
| 前端     | React + Vite + TypeScript     | 生态成熟、AI 生成质量高；Vite 构建快                      |
| UI       | Tailwind CSS + shadcn/ui      | 精细控 UI；shadcn/ui 高质量可定制组件                     |
| 状态管理 | Zustand + TanStack Query      | Zustand 本地 UI 状态；TanStack Query 服务端数据缓存与同步 |

### 仓库结构（已确认）

pnpm workspaces monorepo：

```
Taskora/
├── packages/
│   ├── backend/        # NestJS API
│   ├── frontend/       # React Vite Web
│   └── shared/        # 共享类型（DTO、枚举、常量）
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

未来新增端（如 desktop）时，在 packages/ 下增量添加。

### 同步策略（已确认）

- 服务端权威 + 客户端拉取（pull-based）
- 每次前端操作立即调 API，服务端为唯一真相源
- 用 TanStack Query 的 stale-ness 机制在重回应用或切换视图时自动重新拉取
- 不做离线编辑、不做本地优先同步
- 离线能力、冲突解决作为后续增强

## MVP 范围（已确认）

### MVP 包含

- 收件箱 Inbox：快速收集任务
- 今天 Today：今日待办视角
- 未来 Upcoming：按日期排列的未来任务
- 任意时间 Anytime：无具体日期但需做的任务
- 某天 Someday：暂不执行但保留的任务
- 项目 Projects：有共同目标的任务集合
- 区域 Areas：长期持续的职责范围
- 任务 + 子任务（checklist）
- 截止日期
- 废纸篓 Trash

### MVP 暂缓

- 日志 Logbook
- 标签 Tags
- 重复任务
- 提醒通知

## Acceptance Criteria

- [ ] pnpm monorepo 可运行，`pnpm install` + `pnpm dev` 成功
- [ ] 后端 API 可注册/登录，任务 CRUD REST 端点正常工作
- [ ] 数据库 migration 可执行，Prisma schema 含 User/Task/Project/Area
- [ ] 前端登录/注册页可用，认证流程完整
- [ ] 所有 MVP 视图可用（Inbox/Today/Upcoming/Anytime/Someday/Projects/Areas/Trash）
- [ ] 任务可创建、编辑、完成、删除，支持子任务（checklist）
- [ ] 截止日期可设置
- [ ] 操作即时同步到服务端，切换视图时数据保持一致
- [ ] 视觉风格接近 Things3 的优雅简洁

## Out of Scope

- 日志 Logbook（MVP 后加）
- 标签 Tags（MVP 后加）
- 重复任务
- 提醒通知
- 多端原生客户端（先 Web 端）
- OAuth 社交登录（MVP 后增强；MVP 用邮箱+密码本地认证）

## Open Questions

- 无（所有 MVP 决策已确认）

## Task Map

| Child Task          | 范围                                                                                                | 验收边界                                                       | 依赖                                   |
| ------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| `01-monorepo-setup` | pnpm workspaces、shared 包、tsconfig、ESLint/Prettier、基础脚手架                                   | `pnpm install` 与 `pnpm dev` 可运行，shared 类型可被前后端引用 | 无                                     |
| `02-backend-core`   | NestJS 项目、Prisma schema（User/Task/Project/Area）、邮箱密码认证、任务 CRUD REST API              | API 可注册登录、任务增删改查走 REST，Prisma migration 可执行   | `01-monorepo-setup`                    |
| `03-frontend-core`  | React + Vite + Tailwind + shadcn/ui 脚手架、路由、认证流程、与后端 API 联调                         | 登录/注册页可用，调用 backend API 完成 CRUD                    | `01-monorepo-setup`                    |
| `04-frontend-views` | Things3 核心视图实现：Inbox/Today/Upcoming/Anytime/Someday/Projects/Areas/Trash + 任务详情 + 子任务 | 所有 MVP 视图可用，操作流畅，视觉接近 Things3                  | `02-backend-core` + `03-frontend-core` |

**依赖顺序**：`01` → `02` + `03`（可并行）→ `04`
