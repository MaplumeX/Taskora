# Taskora

[English](README.md) · [简体中文](README.zh-CN.md)

一个受 Things 启发的任务管理应用，采用 pnpm monorepo 架构。后端为 NestJS API + Prisma/PostgreSQL，前端为 Vite + React + Tailwind，附带共享 DTO 包与 Docker 部署方案。

## 功能特性

- **区域 → 项目 → 任务 → 子任务** 的层级组织结构。
- **收纳桶**：收件箱、随时、已计划、稍后、今天、即将、日志、废纸篓。
- **项目标题**：在项目内对任务进行分组。
- **标签与标签组**：支持颜色和排序，可附加到任务、项目和区域。
- **软删除（废纸篓）**：支持恢复与级联清理。
- **JWT 认证**：访问令牌 + 轮换刷新令牌（bcrypt 密码哈希）。
- **国际化**：内置英语与简体中文。
- **拖拽排序**：基于 dnd-kit 实现。

## 技术栈

| 层级 | 技术栈 |
| --- | --- |
| 后端 | NestJS 11, Prisma 6, PostgreSQL 17, Passport-JWT, bcryptjs |
| 前端 | Vite 5, React 18, TailwindCSS 3, TanStack Query, Zustand, react-router, dnd-kit, i18next |
| 共享包 | TypeScript DTO 与枚举（`workspace:*` 引用，不发布到 npm） |
| 工具链 | pnpm 9, Node 22, ESLint, Prettier, Vitest |
| 部署 | Docker（双镜像），GitHub Actions CI/CD，GHCR |

## 项目结构

```
packages/
├── backend/       # NestJS API（Prisma schema、迁移、各模块）
├── frontend/      # Vite + React SPA
└── shared/        # 跨包共享的 DTO / 枚举 / 类型
```

后端模块：`auth`、`users`、`areas`、`projects`、`tasks`、`subtasks`、`tags`、`tag-groups`、`project-headings`、`feed`。所有 API 路由均带 `/api/v1` 前缀。

## 环境要求

- Node.js 22
- pnpm 9（通过 `corepack enable` 启用）
- PostgreSQL 17（或使用附带的 `docker-compose.yml`）

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

后端 —— `packages/backend/.env`：

```env
DATABASE_URL=postgresql://taskora:taskora@localhost:5432/taskora?schema=public
JWT_SECRET=your-secret-here
```

前端 —— `packages/frontend/.env`：

```env
VITE_API_URL=http://localhost:3000/api/v1
```

### 3. 初始化数据库

启动 PostgreSQL（compose 文件已包含，也可自行运行）：

```bash
docker compose up -d postgres
```

执行迁移并生成 Prisma client：

```bash
pnpm --filter @taskora/backend exec prisma migrate dev
pnpm --filter @taskora/backend exec prisma generate
```

可选：加载种子数据：

```bash
pnpm --filter @taskora/backend exec prisma db seed
# 演示账号：test@example.com / password123
```

### 4. 启动开发服务器

```bash
pnpm dev
```

- 前端：http://localhost:5173
- 后端 API：http://localhost:3000/api/v1

## 常用脚本

在仓库根目录执行：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 并行启动所有包（watch 模式） |
| `pnpm typecheck` | 全包类型检查 |
| `pnpm test` | 跨包运行测试 |
| `pnpm lint` | 代码检查 |
| `pnpm format` | Prettier 格式化 |

后端专用命令（通过 `pnpm --filter @taskora/backend exec ...` 执行）：

- `prisma migrate dev` — 创建/应用迁移
- `prisma generate` — 重新生成 Prisma client
- `prisma db seed` — 加载种子数据

## Docker 部署

仓库提供 `docker-compose.yml`，用于本地全栈运行：

```bash
docker compose up -d
```

启动的服务：

- `postgres`：端口 5432
- `backend`：端口 3000（启动时自动执行 `prisma migrate deploy`）
- `frontend`：端口 8080（nginx 托管 SPA，并将 `/api` 反向代理到后端）

### 手动构建镜像

```bash
docker build -f packages/backend/Dockerfile  -t taskora-backend  .
docker build -f packages/frontend/Dockerfile -t taskora-frontend .
```

## CI/CD

GitHub Actions 工作流位于 `.github/workflows/`：

- **CI**（`ci.yml`）—— 每次 PR 和 `main` 分支 push 时触发：安装、类型检查、测试，并验证两个 Docker 镜像可成功构建。
- **Release**（`release.yml`）—— 匹配 `v*` 的 git tag 触发：构建并推送镜像到 GHCR。
  - `ghcr.io/maplumex/taskora-backend:vX.Y.Z` / `:latest`
  - `ghcr.io/maplumex/taskora-frontend:vX.Y.Z` / `:latest`

完整的版本管理、分支策略与多客户端演进计划详见 [docs/versioning-and-deployment.md](docs/versioning-and-deployment.md)。

## 许可

私有项目，保留所有权利。