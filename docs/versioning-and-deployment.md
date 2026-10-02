# 版本管理与部署策略

> 本文档记录 Taskora 在多客户端演进过程中的版本、仓库、部署决策。
> 适用阶段：Web（前后端镜像）+ 桌面端 + 移动端在同一单轨发版（当前）。

## 一、仓库结构

Taskora 是 pnpm monorepo，所有客户端和服务端共享同一仓库。

```
packages/
├── backend/       # NestJS API 服务器
├── frontend/       # Vite + React SPA（Web 客户端壳：路由、入口、登录页）
├── desktop/        # Tauri 2 桌面客户端（见 docs/adr/0001）
├── ui/             # 跨 web/desktop 共享业务组件与页面视图
├── api/            # 跨端共享 API client + Query hooks + 认证流 + i18n
├── shared/         # 跨端共享 DTO / 枚举 / 类型
└── mobile/         # Tauri 2 Android 客户端（见 docs/adr/0010-tauri-v2-mobile-android.md）
```

### 关键决策

- **所有客户端留在同一 monorepo**：跨端共享 `shared` 包、统一 CI。
- **桌面端独立成包**，而不是把 web 用 Tauri 包一层：未来桌面端会有独立导航、原生 IPC 需求。详见 `docs/adr/0001-tauri-for-desktop.md`。
- **桌面端 UI 复用而非重写**：业务组件（任务列表、编辑器等）渐进式抽入 `packages/ui`，数据层（API client、Query hooks、认证流）抽入 `packages/api`，两端各自持有导航壳。
- **`shared` 不对外发布 npm**：仅 monorepo 内部通过 `workspace:*` 引用，不引入 changesets，不发版 CI。

## 二、版本号策略

**统一版本号（当前已生效）：**

| 包                                                                                               | 版本号                                                                       | Tag      |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------- |
| 根 package.json + 全部子包（backend / frontend / api / ui / shared / engine / desktop / mobile） | 统一版本号，写在根 `package.json`，并同步到全部子包与两个 Tauri 壳的版本载体 | `v0.3.0` |

- 所有子包共享同一版本号，不单独漂移（含桌面端与移动端）。
- 历史：v0.3.0 之前桌面端独立版本号（`desktop-v*` tag）。因两端事实上总是同
  步发版、功能一致，双轨版本号只剩成本没有信息量，于 v0.3.0 起合并为单轨；
  移动端（Android）自加入起即直接用 `v*` 单轨，不设 `mobile-v*`。
- 若未来桌面端或移动端出现独立的发版节奏（如纯 Web 热修不出桌面包、或平台
  专属功能），再拆出独立轨道。

**发版命令（已落地）：**

```bash
pnpm release 0.4.0    # bump 根 + 全部子包 + 两个 Tauri 壳 → tag v0.4.0
```

脚本（`scripts/release.mjs`）负责：写版本号、拦截降级、检查工作区干净。
版本载体：根 + 全部子包 `package.json`，以及 `desktop` / `mobile` 两个 Tauri
壳的 `tauri.conf.json`、`Cargo.toml` 与 `Cargo.lock`（两个壳的 CI 构建都带
`--locked`，lock 必须同步）。
发版流程：`pnpm release <version>` → 编辑 `CHANGELOG.md` →
`git commit -am "release: v<x.y.z>"` →
`git tag v<x.y.z> && git push origin main --tags`。
CI 按 tag 自动接管：`v*` 同时触发 `release.yml`（推双镜像）、
`desktop-release.yml`（三平台桌面打包）和 `android-release.yml`
（签名 APK，附到同一个 GitHub Release）。

**不引入 changesets**，理由：

- `shared` 不发包 → 无跨包版本联动需求。
- 只有一条发版线；版本协调由 release 脚本 + tag 解决。

## 二·五、桌面端发布（已定）

- **平台**：三平台出包，主力开发平台为 Linux，Linux 构建质量优先保证。
- **安装包格式**：macOS `.dmg`、Windows NSIS `.exe`、Linux AppImage。`.deb` 等后续有需求再加。
- **CI 策略**：PR / main CI 运行 desktop 的 typecheck、单测、Linux Rust 编译检查和 Windows 原生会话测试；三平台安装包仅在 tag `v*` 时构建发布（与镜像发布同一 tag 触发，两条流水线各自独立）。
- **V1 无自动更新**：用户手动从 GitHub Releases 下载新版；后续再上 `tauri-plugin-updater`（需 updater 签名密钥）。
- **V1 不签名**：macOS 需右键打开绕过 Gatekeeper，Windows 会触发 SmartScreen 警告；README 需写清绕过方法。待有真实用户后购证书。
- **Token 存储**：Windows 使用当前用户 DPAPI 加密的本地 `session.dpapi` 文件；macOS Keychain / Linux Secret Service 保存完整会话条目。不用 WebView localStorage 保存令牌。旧凭据自动迁移，详见 [ADR-0002](adr/0002-windows-dpapi-session-file.md)。

## 二·六、移动端发布（已定）

- **平台**：Android 独占（Tauri 2 Android，见 [ADR-0010](adr/0010-tauri-v2-mobile-android.md)），GitHub Releases 侧载分发，暂不上应用商店。
- **产物**：签名的 arm64 release APK（`Taskora-vX.Y.Z.apk`），附在与桌面端同一个 `v*` Release 上。
- **构建**：`android-release.yml` 在 `v*` tag 触发，release keystore 经 secrets 注入；签名密钥不轮换（轮换会迫使所有用户卸载重装、丢失本地 Local Replica）。
- **版本号**：沿用 monorepo 单轨版本号；Android `versionCode` 由 Tauri 从 version 派生（`major*1000000+minor*1000+patch`），随版本单调递增，无需手动维护。
- **无自动更新**：与桌面端一致，用户手动下载新 APK 覆盖安装（依赖同一签名密钥）。

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

| 场景                         | 双镜像                            |
| ---------------------------- | --------------------------------- |
| 改前端文案                   | 只重打 frontend                   |
| backend hotfix               | 只重打 backend                    |
| 移动端对接稳定 API           | backend 独立版本，可承诺 API 契约 |
| 未来加 mobile/desktop client | backend 镜像零改动                |

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

| 镜像 tag                          | 来源              | 用途                    |
| --------------------------------- | ----------------- | ----------------------- |
| `taskora-backend:v0.1.0`          | git tag `v0.1.0`  | 正式发版，部署生产      |
| `taskora-backend:sha-<7位commit>` | 每次合并到 `main` | staging 部署 / 回滚定位 |

镜像 label 写入版本信息，方便从运行中的容器反查：

```dockerfile
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
```

## 四·五、数据库升级与故障恢复（migration recovery）

### 升级契约

- backend 在启动 HTTP 服务之前执行数据库迁移。迁移失败时不开放 API，不应通过放宽 frontend 的健康依赖掩盖故障。
- expand → 数据迁移 → contract 按发布阶段推进，但**历史数据转换必须保留在迁移路径内**。用户允许跳过中间版本，不能依赖某个中间版本的应用启动 hook。
- 执行 contract 前停止所有不兼容的旧 backend。新 bootstrap 的专用 PostgreSQL 会话锁只串行化新实例的检查 / resolve / deploy，不会阻止旧应用写入；不要同时运行外部手工迁移和自动启动。
- schema 迁移仍用 `prisma migrate deploy`；已失败的迁移不能仅靠追加后续 SQL 解锁。
- CI 的 `migrations.e2e-spec.ts` 使用独立 schema + 真实 Prisma CLI 覆盖事务、算法一致性、重复部署、并发和失败恢复；`migration-smoke.mjs` 在实际镜像上验证 v0.7.1 / v0.7.2 历史 DDL + 合成数据、P3009、空库的启动健康状态。新增 contract 应同步扩展受支持的历史版本与数据 fixture。

### Position 升级故障补丁

`20261002180000_drop_sort_order` 曾在回填前拒绝空 Position，导致自建旧库无法启动。补丁将历史合成算法冻结在同一事务中，先回填七张表的空值，再断言并删列。已有 Position、updatedAt、字段时钟和同步日志保持不变；Local Replica 7 → 8 的结果必须逐字一致。

这是**修正已发布迁移的受控例外**：原文件 SHA-256 为 `88b8e90e25caed20e687f04e20645e4cb1758fdc67d568fcc1415becc9a0a134`，原文件保留在 `packages/backend/test/fixtures/drop-sort-order.original.sql`。已经成功应用原文件的库不会重跑或重写历史 checksum；`migrate deploy` 的此路径有真库测试。若开发库的 `migrate dev` 提示历史文件被修改，只对可丢弃开发库重建；不得对生产执行 `migrate reset` 或手改 checksum。

新版 backend 只自动恢复**唯一失败记录 + 原 checksum + 原 guard 错误 + 完整旧列状态**的已知故障：在专用直连会话持锁期间，执行一次 `migrate resolve --rolled-back`，再 deploy 修正后的迁移。未知失败、部分删列、修正后迁移被中断等状态一律保留供人工检查，不循环 resolve。数据库 URL 必须能建立会话级直连，不支持经过 transaction-pooling 代理来持此锁。

### 已卡住实例的操作步骤

1. 停止 backend / frontend，保留 postgres，先备份并确认备份可用。
2. 拉取包含修复的 backend 镜像，再 `docker compose up -d --wait`；上述已知 guard 失败会自动恢复。
3. 若仍失败，停止重启循环，检查状态与迁移日志：

```bash
docker compose stop backend frontend
docker compose logs --tail=200 backend
docker compose run --rm --no-deps backend \
  node node_modules/prisma/build/index.js migrate status
```

在目标 schema 中查询：

```sql
SELECT migration_name, checksum, logs, started_at, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE finished_at IS NULL AND rolled_back_at IS NULL;
```

确认失败操作已全部回滚或已人工恢复到可重跑状态后，才执行：

```bash
docker compose run --rm --no-deps backend \
  node node_modules/prisma/build/index.js migrate resolve \
  --rolled-back 20261002180000_drop_sort_order
docker compose run --rm --no-deps backend \
  node node_modules/prisma/build/index.js migrate deploy
docker compose up -d --wait
```

`resolve --rolled-back` **不执行数据库回滚**，只修改迁移记录。不要删除 `_prisma_migrations` 行，不要盲目 resolve 未知失败；删列成功后也不能直接切回依赖 sortOrder 的旧镜像。恢复后的检查包括七表 Position 非空、sortOrder 已删除、无未解决失败记录、`/api/v1/health` 返回 200。

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

**3. `desktop-release.yml`（git tag `v*` 触发）**

- 三平台 Tauri 打包上传 GitHub Releases，与 `release.yml` 同 tag、独立运行。

**4. `android-release.yml`（git tag `v*` 触发）**

- 生成 Android 工程、注入 release 签名，构建 arm64 签名 APK，附到同一个
  GitHub Release。与 `desktop-release.yml` 无顺序保证：两条流水线各自先确保
  release 存在再上传资产。

### 未来阶段（多客户端）

当前三端统一单轨、共用 `v*` tag 与单一 `ci.yml`。等某个端需要独立发版
节奏时，再拆成互不干扰的独立 pipeline：

1. `ci-backend.yml` — PR 触发测试 + migration 检查
2. `ci-web.yml` — PR 触发构建 + 类型检查
3. `ci-clients.yml` — 仅在对应 tag（如恢复 `desktop-v*` / 新增 `mobile-v*`）推送时触发打包上传

这样各客户端可以各自发版，不会因为一个客户端的改动启动其他平台构建。

## 七、Staged 行动清单

**现在要做（服务端开发期）：**

1. 写 `packages/backend/Dockerfile`（单体产物镜像）
2. 写 `packages/frontend/Dockerfile`（nginx 托管静态文件 + 反代 /api）
3. 写 `.dockerignore`（过滤 node_modules / dist / .git 等）
4. 写 `docker-compose.yml`（本地开发用，跑 postgres + backend + frontend）
5. ~~给 NestJS 加 `/api/v1` 前缀（`app.setGlobalPrefix('api/v1')`）~~ ✅ 已完成（`backend/src/main.ts`）
6. ~~CI 加 `typecheck + test + docker build` 步骤（验证可构建）~~ ✅ 已完成（`ci.yml`）
7. ~~发版脚本：`pnpm release <version>`（统一单轨，v0.3.0 起含桌面端）~~ ✅ 已完成（`scripts/release.mjs`）

**未来要做（多客户端阶段，加法，不推翻现在决策）：**

1. ~~加 mobile 后新增 `mobile-v*` tag 前缀~~ ✅ 未采用：移动端直接用 `v*` 单轨
2. 拆分 CI pipeline 为每客户端一条（当前仍共用 `ci.yml`）
3. ~~设计增量同步协议（`updated_at` + `deleted_at` + 客户端 ID）~~ ✅ 已落地（local-first engine，见 [ADR-0007](adr/0007-local-first-engine.md)）
4. ~~移动端 EAS Update / Submit 管道对接 git tag~~ ✅ 未采用：Tauri Android + GitHub Releases 侧载
5. 桌面端 / 移动端自更新通道
6. 桌面端 / 移动端需要独立发版节奏时，恢复独立轨道（发版脚本需扩展回多轨）
