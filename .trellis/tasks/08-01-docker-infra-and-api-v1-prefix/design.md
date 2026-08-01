# 技术设计

## 架构概览

```
docker-compose
├── postgres:17-alpine  (5432)
├── backend             (3000, 内部)
│   ├── Node + NestJS dist
│   ├── prisma/ (schema + migrations)
│   └── 启动时 prisma migrate deploy
└── frontend            (80, 对外)
    ├── nginx 托管 vite build 产物
    └── /api/v1 → proxy_pass http://backend:3000
```

## 数据流

```
Browser → frontend:80
  ├── 静态资源 → nginx serve dist/
  └── /api/v1/* → nginx proxy → backend:3000/api/v1/*
                                    └── NestJS (setGlobalPrefix('api/v1'))
                                        └── Prisma → postgres:5432
```

## 文件清单

| 文件 | 动作 | 说明 |
|---|---|---|
| `packages/backend/Dockerfile` | 新建 | 多阶段：install → build → runtime |
| `packages/frontend/Dockerfile` | 新建 | 多阶段：vite build → nginx serve |
| `packages/frontend/nginx.conf` | 新建 | SPA fallback + /api/v1 反代 |
| `docker-compose.yml` | 新建 | postgres + backend + frontend |
| `.dockerignore` | 新建 | 排除非必要文件 |
| `packages/backend/src/main.ts` | 修改 | 加 `app.setGlobalPrefix('api/v1')` |
| `packages/backend/test/areas.controller.e2e-spec.ts` | 修改 | 加 `setGlobalPrefix` + 路径加前缀 |
| `packages/frontend/src/lib/api/client.ts` | 修改 | baseURL fallback 加 `/api/v1` |

## Backend Dockerfile 设计

### 多阶段构建

**Stage 1: base（依赖安装）**
- FROM `node:22-alpine`
- `corepack enable`（pnpm）
- 复制 `pnpm-workspace.yaml`、`pnpm-lock.yaml`、根 `package.json`
- 复制 `packages/shared/package.json`、`packages/backend/package.json`
- `pnpm install --frozen-lockfile --filter @taskora/backend --filter @taskora/shared`
  - 只装 backend 和 shared 的依赖（含 devDependencies，build 需要）

**Stage 2: build**
- FROM base
- 复制 `packages/shared` 源码 → `pnpm --filter @taskora/shared build`（产出 `dist/`）
- 复制 `packages/backend` 源码 → `pnpm --filter @taskora/backend build`（产出 `dist/`）
- `pnpm --filter @taskora/backend exec prisma generate`（生成 Prisma Client）

**Stage 3: runtime**
- FROM `node:22-alpine`
- 复制 `dist/`、`node_modules/`、`prisma/`（schema + migrations）
- EXPOSE 3000
- CMD `node dist/main.js`
- main.ts 已有 `runDatabaseMigrations()`，启动自动 migrate

### 关键决策

- **build context = 仓库根目录**：因为 backend 依赖 shared（workspace），Dockerfile 需访问 `packages/shared`。放置在 `packages/backend/Dockerfile`，构建命令 `docker build -f packages/backend/Dockerfile .`。
- **不 prune devDependencies**：runtime 阶段直接复制 build 阶段的 `node_modules`，因为 `nestjs build` 产物不包含 node_modules，但运行时需要 `@prisma/client`、`@nestjs/*` 等依赖。额外 `pnpm prune --prod` 会移除 devDependencies，减小镜像体积。

## Frontend Dockerfile 设计

### 多阶段构建

**Stage 1: build**
- FROM `node:22-alpine`
- `corepack enable`
- 复制 workspace 配置 + lockfile + package.json
- 复制 `packages/shared/package.json`、`packages/frontend/package.json`
- `pnpm install --frozen-lockfile --filter @taskora/frontend --filter @taskora/shared`
- 复制 `packages/shared` 源码 → build shared
- 复制 `packages/frontend` 源码
- `VITE_API_URL=/api/v1 pnpm --filter @taskora/frontend build`（同源相对路径）

**Stage 2: runtime**
- FROM `nginx:alpine`
- 复制 `packages/frontend/dist` → `/usr/share/nginx/html`
- 复制 `nginx.conf` → `/etc/nginx/conf.d/default.conf`
- EXPOSE 80

### nginx.conf 设计

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反代
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- `proxy_pass http://backend:3000;`（不带尾部 path，保留 `/api/v1` 前缀原样转发）
- `location /api/` 匹配所有 `/api/*` 路径

## docker-compose.yml 设计

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: taskora
      POSTGRES_PASSWORD: taskora
      POSTGRES_DB: taskora
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build:
      context: .
      dockerfile: packages/backend/Dockerfile
    environment:
      DATABASE_URL: postgresql://taskora:taskora@postgres:5432/taskora?schema=public
      JWT_SECRET: dev-secret-change-in-production
      PORT: 3000
    depends_on:
      - postgres
    ports:
      - "3000:3000"

  frontend:
    build:
      context: .
      dockerfile: packages/frontend/Dockerfile
    depends_on:
      - backend
    ports:
      - "8080:80"

volumes:
  pgdata:
```

- frontend 映射 8080:80（避免占用宿主机 80）。
- postgres 端口 5432 对外暴露（开发方便直连）。
- `DATABASE_URL` 中 host 为 `postgres`（compose 服务名）。

## API v1 前缀设计

### main.ts 改动

```typescript
app.setGlobalPrefix('api/v1');
```
- 放在 `app.use(cookieParser()` 之后、`useGlobalPipes` 之前。
- 所有 Controller 路由自动加前缀：`/api/v1/auth/login`、`/api/v1/tasks` 等。
- 不需要在每个 Controller 上手动加前缀。

### e2e 测试改动

`areas.controller.e2e-spec.ts`：
- `beforeAll` 里加 `app.setGlobalPrefix('api/v1')`。
- 所有 `request(app.getHttpServer()).post('/areas')` → `.post('/api/v1/areas')`。
- 共 7 处请求路径需加前缀。

### frontend client.ts 改动

```typescript
baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
```
- 开发环境：fallback 到 `http://localhost:3000/api/v1`，走 CORS。
- 生产环境：构建时 `VITE_API_URL=/api/v1`，走 nginx 同源反代。

## 兼容性与迁移

- **向后不兼容**：加 `/api/v1` 前缀后，所有现有 API 路径变化。当前无外部消费者（仅 frontend），frontend 同步适配即可。
- **本地 dev 流程不变**：`pnpm dev` 继续 vite(5173) + nest(3000) 分进程跑，CORS 照常。
- **docker-compose 本地验证**：`docker compose up` 后访问 `http://localhost:8080`。

## 回滚

- 所有改动可通过 `git revert` 回滚。
- Docker 镜像构建失败不影响现有 `pnpm dev` 流程。
