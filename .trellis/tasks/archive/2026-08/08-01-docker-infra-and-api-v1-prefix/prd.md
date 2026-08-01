# Docker 部署基础设施与 API v1 前缀

## Goal

为 Taskora 创建可本地运行的双镜像 Docker 部署基础设施（backend + frontend/nginx），并给 NestJS 所有路由加 `/api/v1` 全局前缀，使后端成为可对多客户端承诺 API 契约的独立服务。对应 `docs/versioning-and-deployment.md` Staged 行动清单第 1-5 项。

## Background

- 当前为 pnpm monorepo：`packages/backend`（NestJS, port 3000）、`packages/frontend`（Vite + React, port 5173）、`packages/shared`（DTO/枚举，需 `tsc` build 出 `dist/`）。
- backend `main.ts` 启动时自动执行 `prisma migrate deploy`。
- frontend baseURL 当前为 `VITE_API_URL || 'http://localhost:3000'`。
- backend CORS `origin: true`，允许跨源。
- 只有 1 个 e2e 测试文件（`areas.controller.e2e-spec.ts`）使用 supertest 直接调路由路径。

## Requirements

### R1: Backend Dockerfile
- 多阶段构建，基于 `node:22-alpine`。
- 构建时需访问 `packages/shared`（workspace 依赖，不发包）。
- 运行时镜像包含：backend `dist/`、`node_modules`、`prisma/`（schema + migrations）。
- 不包含源码、devDependencies。
- 暴露端口 3000。

### R2: Frontend Dockerfile
- 多阶段构建：构建阶段用 `node:22-alpine` 跑 `vite build`，运行阶段用 `nginx:alpine` 托管静态文件。
- 构建时 `VITE_API_URL=/api/v1`（同源相对路径，nginx 反代 `/api/v1` → `backend:3000`）。
- nginx 配置：SPA fallback（`try_files $uri /index.html`）+ `/api/v1` 反代到 `backend:3000`。
- 暴露端口 80。

### R3: docker-compose.yml
- 三个服务：`postgres`（17-alpine）、`backend`、`frontend`。
- `backend` 依赖 `postgres`，通过 `DATABASE_URL` 环境变量连接。
- `frontend` 依赖 `backend`。
- 适合本地开发/验证，非生产配置（不挂 TLS、不调资源限制）。

### R4: .dockerignore
- 过滤 `node_modules`、`dist`、`.git`、`.trellis`、`.pi`、`.codex`、`.agents`、`*.md`（非源码）、`.env`、`pnpm-lock.yaml` 以外的 lock 文件等。
- 确保不把本地 `.env` 泄入镜像。

### R5: NestJS `/api/v1` 全局前缀
- `main.ts` 加 `app.setGlobalPrefix('api/v1')`。
- e2e 测试（`areas.controller.e2e-spec.ts`）同步加 `setGlobalPrefix` 并修改请求路径为 `/api/v1/...`。

### R6: Frontend baseURL 适配
- `client.ts` 的 fallback 从 `'http://localhost:3000'` 改为 `'http://localhost:3000/api/v1'`。
- 开发环境（vite 5173 → backend 3000）继续走 CORS，baseURL 已适配。
- 生产环境 Docker 构建时 `VITE_API_URL=/api/v1`。

## Acceptance Criteria

- [ ] `docker compose build` 无错误地构建 backend 和 frontend 镜像。
- [ ] `docker compose up` 启动 postgres + backend + frontend，backend 自动执行 migration 并监听 3000。
- [ ] 浏览器访问 `http://localhost` 能打开 frontend 页面。
- [ ] frontend 发出的 `/api/v1/...` 请求经 nginx 反代到达 backend 并正常返回。
- [ ] backend 所有路由以 `/api/v1` 开头（如 `/api/v1/auth/login`）。
- [ ] `pnpm --filter @taskora/backend test` 全部通过（含 e2e）。
- [ ] `pnpm typecheck` 全部通过。
- [ ] `.dockerignore` 存在且排除 `node_modules`、`dist`、`.git`、`.env`。

## Out of Scope

- CI/CD pipeline 配置（docs 行动清单第 6 项，后续任务）。
- 镜像 registry push（本地 build 能跑即可）。
- 生产环境 TLS / 域名 / 资源限制配置。
- 移动端 / 桌面端客户端实现。
- 增量同步协议设计。
