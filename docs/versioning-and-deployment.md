# 版本管理与部署策略

> 本文档记录 Taskora 在多客户端演进过程中的版本、仓库、部署决策。
> 适用阶段：服务端开发期（当前）→ 移动端 / 桌面端引入（未来）。

## 一、仓库结构

Taskora 是 pnpm monorepo，所有客户端和服务端共享同一仓库。

```
packages/
├── backend/       # NestJS API 服务器（当前主战场）
├── frontend/      # Vite + React SPA（Web 客户端）
├── shared/        # 跨端共享 DTO / 枚举 / 类型
├── mobile/        # 未来：React Native / Expo
└── desktop/       # 未来：Tauri / Electron（独立成包）
```

### 关键决策

- **所有客户端留在同一 monorepo**：跨端共享 `shared` 包、统一 CI。
- **桌面端独立成包**，而不是把 web 用 Tauri 包一层：未来桌面端会有独立导航、原生 IPC 需求。
- **`shared` 不对外发布 npm**：仅 monorepo 内部通过 `workspace:*` 引用，不引入 changesets，不发版 CI。

## 二、版本号策略

### 当前阶段（服务端开发期）

**统一版本号，写在根 `package.json`：**

```json
{ "version": "0.0.1" }
```

- 所有子包继承根版本，不单独打版本号。
- 开发阶段继续 `0.0.x` 递增，每次正式发版手动 bump。

**不引入 changesets**，理由：
- `shared` 不发包 → 无跨包版本联动需求。
- 当前只有一条发版线 → 无版本协调问题。

### 未来阶段（多客户端引入后）

**双轨制版本：**

| 轨道 | 格式 | 适用对象 | 发版触发 |
|---|---|---|---|
| **包版本（SemVer）** | `x.y.z` | `@taskora/shared`（若未来对外发布）、backend | changesets / 手动 tag |
| **应用版本** | `x.y.z` + build 号 | mobile（商店需要 build 号）、desktop（自更新通道）| tag `mobile-v*` / `desktop-v*` 触发独立 CI |

**Tag 前缀约定：**

- 当前只有 backend 发版：`v0.1.0`、`v0.2.0`...
- 多客户端阶段改为带前缀：
  - `backend-v0.1.0`
  - `mobile-v1.0.0`
  - `desktop-v0.1.0`

make Git tag 从无前缀迁移到带前缀是纯加法，不破坏历史 tag。

## 三、分支策略

最简模型，适合当前规模：

```
main              ← 始终可部署
 ├─ feature/xxx   ← 功能分支，PR 合入 main
 └─ fix/xxx       ← 修复分支
```

**规则：**

1. `main` 分支永远可部署（绿）。
2. 所有改动走 PR 合入 `main`，PR 必须通过 CI（typecheck + test + build）。
3. 不用 `develop` 分支 —— 现在没必要，等有多客户端并行发版时再考虑。
4. 不用 release branch —— 用 git tag 替代，tag 打在 `main` 的某个 commit 上。

**流程图：**

```
feature/xxx → PR → main (CI 全绿)
                        │
                        ├─ 每次合并 → 构建镜像 :sha-<commit>  → 部署 staging
                        │
                        └─ 人工打 tag v0.1.0 → 构建镜像 :v0.1.0 → 部署生产
```

## 四、部署架构

### 镜像结构：双镜像（路线 A）

```
镜像1: taskora-backend    ← Node 跑 NestJS API
镜像2: taskora-frontend   ← nginx 托管 vite 构建产物 + 反代 /api 到 backend
```

**为什么不是单镜像：**

- 单镜像会把 backend 和 frontend 版本绑死，无法独立发版。
- 单镜像在改前端文案时必须重打整个镜像、backend 也跟着重新部署。
- 单镜像下 backend 版本号被 frontend 绑架，无法对移动端承诺 API 契约。
- **核心原则**：`taskora-backend` 作为独立可发版、可对多客户端承诺 API 稳定性的服务。

**双镜像带来的收益：**

| 场景 | 双镜像 |
|---|---|
| 改前端文案 | 只重打 frontend |
| backend hotfix | 只重打 backend |
| 移动端对接稳定 API | backend 独立版本，可承诺 API 契约 |
| 未来加 mobile/desktop client | backend 镜像零改动 |

### Docker Compose 拓扑

```yaml
services:
  backend:
    build: { context: ., dockerfile: packages/backend/Dockerfile }
    env: DATABASE_URL, PORT, JWT_SECRET...
    depends_on: [postgres]
  frontend:
    build: { context: ., dockerfile: packages/frontend/Dockerfile }
    # nginx serve dist + proxy /api → backend:3000
    depends_on: [backend]
  postgres:
    image: postgres:17-alpine
    volumes: [pgdata:/var/lib/postgresql/data]
```

### 镜像版本 Tag

| 镜像 tag | 来源 | 用途 |
|---|---|---|
| `taskora-backend:v0.1.0` | git tag `v0.1.0` | 正式发版，部署生产 |
| `taskora-backend:sha-<7位commit>` | 每次合并到 `main` | staging 部署 / 回滚定位 |

镜像 label 写入版本信息，方便从运行中的容器反查：

```dockerfile
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
```

## 五、多端数据同步（未来设计，现在不做）

### 同步协议演进路径

当前保持**纯在线请求**模式，schema 方向已对（`trashed` 状态机、tags、subtask 独立表）。等移动端真要动工时再设计增量同步。

演进路径：

1. **纯在线请求**（当前）— 最简单，无离线，API 就够用。
2. **离线优先 + 增量同步**（未来）— 需要 `updated_at` + `deleted_at` + 客户端 ID。
3. **实时推送**（未来）— WebSocket / SSE，NestJS 原生支持。

### API 版本前缀

**未来移动端 / 桌面端要对接 backend，需要 API 版本前缀：**

- 所有 NestJS controller 加 `/api/v1` 前缀：`app.setGlobalPrefix('api/v1')`。
- 移动端 / 桌面端绑定某个 v1 契约，backend 升级到 v2 时老客户端仍可用 v1。
- **尽早加**，否则后期迁移痛苦。

### 认证

现有 refresh token 机制已够用（`add_refresh_tokens` migration 证实），移动端 / 桌面端天然用这套，无需额外设计。

## 六、CI/CD

### 当前阶段（最小化）

**1. `ci.yml`（PR 和 main push 触发）**

- checkout → pnpm install → typecheck → test → docker build
- main 分支：构建镜像 `:sha-<commit>`，先验证可构建，不做自动 push。

**2. `release.yml`（git tag `v*` 触发）**

- checkout → docker build → 推送到 registry → 触发生产部署。

### 未来阶段（多客户端）

三条独立 pipeline，互不干扰：

1. `ci-backend.yml` — PR 触发测试 + migration 检查
2. `ci-web.yml` — PR 触发构建 + 类型检查
3. `ci-clients.yml` — 仅在对应 tag（`mobile-v*` / `desktop-v*`）推送时触发打包上传

这样各客户端可以各自发版，不会因为一个客户端的改动启动其他平台构建。

## 七、Staged 行动清单

**现在要做（服务端开发期）：**

1. 写 `packages/backend/Dockerfile`（单体产物镜像）
2. 写 `packages/frontend/Dockerfile`（nginx 托管静态文件 + 反代 /api）
3. 写 `.dockerignore`（过滤 node_modules / dist / .git 等）
4. 写 `docker-compose.yml`（本地开发用，跑 postgres + backend + frontend）
5. 给 NestJS 加 `/api/v1` 前缀（`app.setGlobalPrefix('api/v1')`）
6. CI 加 `typecheck + test + docker build` 步骤（验证可构建）

**未来要做（多客户端阶段，加法，不推翻现在决策）：**

1. tag 改为带前缀：`backend-v*` / `mobile-v*` / `desktop-v*`
2. 拆分 CI pipeline 为每客户端一条
3. 设计增量同步协议（`updated_at` + `deleted_at` + 客户端 ID）
4. 移动端 EAS Update / Submit 管道对接 git tag
5. 桌面端自更新通道
