# 执行计划

## 实施步骤（按顺序）

### Step 1: 创建 .dockerignore
- 仓库根目录新建 `.dockerignore`。
- 排除：`node_modules`、`**/dist`、`.git`、`.trellis`、`.pi`、`.pi-subagents`、`.codex`、`.agents`、`*.md`（ docs/ 下的非源码）、`.env`、`.env.*`、`pnpm-lock.yaml` 以外的 lock 文件、IDE 配置等。
- **验证**：`cat .dockerignore` 确认内容。

### Step 2: 创建 Backend Dockerfile
- `packages/backend/Dockerfile`，多阶段构建（base → build → runtime）。
- base: 安装 pnpm，复制 workspace 配置 + lockfile + package.json，安装 backend + shared 依赖。
- build: build shared → build backend → prisma generate。
- runtime: 复制 dist + node_modules + prisma，EXPOSE 3000，CMD `node dist/main.js`。
- **验证**：`docker build -f packages/backend/Dockerfile -t taskora-backend:test .` 成功。

### Step 3: 创建 Frontend nginx.conf + Dockerfile
- `packages/frontend/nginx.conf`：SPA fallback + `/api/` 反代 `http://backend:3000`。
- `packages/frontend/Dockerfile`，多阶段（build → runtime）。
- build: 安装 pnpm，安装 frontend + shared 依赖，build shared，`VITE_API_URL=/api/v1` build frontend。
- runtime: `nginx:alpine`，复制 dist + nginx.conf，EXPOSE 80。
- **验证**：`docker build -f packages/frontend/Dockerfile -t taskora-frontend:test .` 成功。

### Step 4: 创建 docker-compose.yml
- 仓库根目录新建 `docker-compose.yml`。
- 三个服务：`postgres`（17-alpine）、`backend`、`frontend`。
- frontend 映射 `8080:80`，backend 映射 `3000:3000`，postgres 映射 `5432:5432`。
- **验证**：`docker compose config` 校验语法。

### Step 5: NestJS 加 /api/v1 前缀
- `packages/backend/src/main.ts`：`app.use(cookieParser())` 后加 `app.setGlobalPrefix('api/v1')`。
- **验证**：`grep setGlobalPrefix packages/backend/src/main.ts`。

### Step 6: e2e 测试适配前缀
- `packages/backend/test/areas.controller.e2e-spec.ts`：
  - `beforeAll` 里 `app` 创建后加 `app.setGlobalPrefix('api/v1')`。
  - 7 处请求路径 `/areas` → `/api/v1/areas`。
- **验证**：`grep -c "/api/v1" packages/backend/test/areas.controller.e2e-spec.ts` ≥ 7。

### Step 7: Frontend baseURL 适配
- `packages/frontend/src/lib/api/client.ts`：fallback 改为 `'http://localhost:3000/api/v1'`。
- **验证**：`grep "api/v1" packages/frontend/src/lib/api/client.ts`。

## 验证命令

```bash
# 类型检查
pnpm typecheck

# 单元 + e2e 测试
pnpm --filter @taskora/backend test

# Docker 镜像构建
docker build -f packages/backend/Dockerfile -t taskora-backend:test .
docker build -f packages/frontend/Dockerfile -t taskora-frontend:test .

# Compose 语法校验
docker compose config

# 端到端验证（手动）
docker compose up -d
# → 访问 http://localhost:8080 打开前端
# → 确认 /api/v1/auth/login 等请求正常
docker compose down -v
```

## 回滚点

- 每步独立可回滚（git revert）。
- Docker 文件创建不修改现有 dev 流程，失败可安全跳过。
- API 前缀改动（Step 5-7）是一个原子单元，三步必须一起完成才能保证一致性。

## 风险

| 风险 | 缓解 |
|---|---|
| `pnpm install --frozen-lockfile` 在 Docker 中失败 | 确保 `pnpm-lock.yaml` 与 `package.json` 同步 |
| shared 的 `dist/` 未被正确复制到 backend 镜像 | build 阶段先 build shared，再 build backend |
| e2e 测试遗漏路径修改 | Step 6 验证 grep 数量 ≥ 7 |
| nginx `proxy_pass` 路径截断 | 使用 `proxy_pass http://backend:3000;`（无尾部 path）保留原始 URI |
