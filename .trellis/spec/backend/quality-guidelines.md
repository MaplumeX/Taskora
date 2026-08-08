# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

后端代码质量标准。所有代码必须通过 `pnpm lint` 和 `pnpm typecheck`。

## Monorepo 约定

- 包名统一用 `@taskora/*` 命名空间
- 包间依赖用 `"workspace:*"` 协议
- TS 配置继承根 `tsconfig.base.json`：`"extends": "../../tsconfig.base.json"`
- 根 scripts 用 `pnpm -r --parallel run <script>` 并行执行所有 workspace

---

## Forbidden Patterns

### 不带 userId 的数据查询

所有 Prisma 业务查询必须包含 `userId` 隔离，严禁仅用 `id` 查询。

### 根目录直接安装依赖

禁止在根 `package.json` 安装业务依赖。仅 dev 工具（ESLint、Prettier、TypeScript）可放根。业务依赖放各子包。

---

## Required Patterns

### 控制器层
- 资源控制器用 `@Controller('tasks')` 复数资源名
- 所有写/读操作加 `@UseGuards(JwtAuthGuard)`，从 `@Request() req.user.id` 取 userId 传入 service
- `@Param()` / `@Query()` / `@Body()` 参数显式标注，`@Body()` 必须是单一 DTO class（非交叉类型）

```typescript
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  @Get(':id')
  findOne(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.tasksService.findOne(req.user.id, id);
  }
}
```

### 认证端点（cookie 模式）

`AuthController` 处理两类端点：

- **登录/注册/refresh**：返回 accessToken + 通过 `@Res({ passthrough: true }) res: Response` 设置 refresh token cookie（`res.cookie(RT_COOKIE_NAME, rt, COOKIE_OPTS)`），不手动返回 RT。
- **logout/refresh 失败**：`res.clearCookie(RT_COOKIE_NAME, { path: '/api/v1/auth' })` 清理 cookie。

```typescript
@Post('login')
async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
  const { accessToken, rt, user } = await this.authService.login(dto);
  res.cookie(RT_COOKIE_NAME, rt, COOKIE_OPTS);  // HttpOnly，前端读不到
  return { accessToken, user };                  // 只返回 accessToken
}
```

RT cookie 选项统一在 `refresh-token.helpers.ts`：`httpOnly: true, sameSite: 'lax', path: '/api/v1/auth'`，`secure` 仅生产环境。不散落各处。

> **Warning: Cookie path 必须与全局前缀同步**
>
> `main.ts` 使用 `app.setGlobalPrefix('api/v1')` 后，所有路由从 `/auth/*` 变为 `/api/v1/auth/*`。Cookie 的 `path` 也必须同步从 `'/auth'` 改为 `'/api/v1/auth'`，否则浏览器不会在 `/api/v1/auth/refresh` 等请求中发送该 cookie，导致 refresh/logout 流程静默失效。修改全局前缀时务必检查所有 cookie path。

### 用户自管端点

`UsersController` 提供以下端点，与 auth 注册/登录分离，避免 auth 模块职责过重：

| 端点 | 功能 | 说明 |
|------|------|------|
| `PUT /users/me` | profile 字段部分更新 | 仅传入字段才更新 |
| `PUT /users/me/password` | 改密码 | 需验证 `currentPassword`（bcrypt.compare） |
| `PUT /users/me/preferences` | 更新用户偏好 | 合并语义：读现有 preferences → 浅合并 dto → 写回。preferences 是 `Json?` 字段 |
| `DELETE /users/me` | 删除账户 | 需验证密码（bcrypt.compare），`prisma.user.delete` 级联清空所有关联（`onDelete: Cascade`） |
| `GET /users/me/export` | 导出全部数据 | `Promise.all` 并行查全部业务表（where 含 userId），返回嵌套 JSON |

### User preferences（Json? 字段）合并语义

`updatePreferences` 采用读-合并-写模式（非 Prisma 原子操作）：

```typescript
const user = await this.prisma.user.findUnique({
  where: { id: userId },
  select: { preferences: true },
});
const current = (user.preferences ?? {}) as Record<string, unknown>;
const merged = { ...current, ...dto };
await this.prisma.user.update({
  where: { id: userId },
  data: { preferences: merged },
});
```

- null preferences 起步时用空对象 `{}`
- 浅合并：dto 中传入的字段覆盖现有值，未传入的字段保留
- 并发写入竞态可接受（最终一致），不做乐观锁

### 账户删除（物理删除 + Cascade）

`deleteAccount` 是用户模块中唯一的物理 `prisma.user.delete` 触点：
- 验证密码后直接 `prisma.user.delete({ where: { id: userId } })`
- `User` 的所有关联（tasks / projects / areas / tags / tagGroups / projectHeadings / refreshTokens）通过 schema `onDelete: Cascade` 自动清空
- 不需要手工级联删除各业务表

### Service 层
- `@Injectable()` 装饰，构造函数注入 `PrismaService`（及 `JwtService` 等）
- 业务方法第一个参数恒为 `userId: string`，所有 Prisma where 必须含 `userId`
- 业务错误用 NestJS HttpException 子类（`NotFoundException`/`ConflictException`/`UnauthorizedException`）抛出，不返回 `null` 表示错误
- 软删除优先：Task / Project 用 `trashedAt` 表达删除状态（`status` 只保留 `ACTIVE | COMPLETED`，详见 database-guidelines.md 的 status enum 拆分决策），`RefreshToken` 用 `revokedAt`，均不用 `prisma.*.delete`（`FeedService.emptyTrash` 是唯一物理删除例外）
- 用户 profile 公开字段统一用 `USER_PUBLIC_SELECT` 常量（`users.service.ts`），各处查询复用，避免泄露 `passwordHash`

### DTO
- DTO 定义在 `@taskora/shared`，模块内 `dto/` 文件重导出（`export { CreateTaskDto } from '@taskora/shared'`），避免后端内重复定义
- 用 `class-validator` 装饰器（`@IsEmail`/`@MinLength` 等），配合全局 `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
- `@Query()` 参数对应单一 DTO class，不可用交叉类型（见 error-handling.md 常见错误）

---

## Testing Requirements

### 测试运行器：Vitest

- 前后端统一用 vitest（`packages/backend/vitest.config.ts`、`packages/frontend/vitest.config.ts`）
- 后端 Service 单测用 `new XxxService(mockPrisma)` 直接构造，**不依赖 NestJS DI 的 `Test.createTestingModule`**（vitest 的 esbuild 转译不支持 `emitDecoratorMetadata`，NestJS DI 无法解析构造函数类型令牌）
- 后端 Controller e2e 测试用 `@nestjs/testing` 的 `Test.createTestingModule` + `supertest`，走完整 HTTP 管道

### 测试文件命名约定

| 类型 | 命名 | 位置 |
|------|------|------|
| Service 单测 | `*.spec.ts` | `packages/backend/test/` |
| Controller e2e | `*.e2e-spec.ts` | `packages/backend/test/` |

### 测试数据库隔离

- e2e 测试通过 `TEST_DATABASE_URL` 环境变量连接独立的测试 Postgres 实例
- `test/db.ts` 导出 `resetDb()`（TRUNCATE 所有业务表）和 `testPrisma`（独立 PrismaClient 实例）
- 若 `TEST_DATABASE_URL` 未设置，e2e 测试通过 `describe.skip` 跳过，不阻塞 `pnpm test`
- 运行 e2e 测试：
  ```bash
  TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/taskora_test" \
    pnpm --filter @taskora/backend test
  ```
- 可用 docker 快速起测试数据库：
  ```bash
  docker run -d --name taskora-test-db -e POSTGRES_DB=taskora_test -e POSTGRES_USER=user -e POSTGRES_PASSWORD=pass -p 5432:5432 postgres:16
  ```
  然后执行 `npx prisma migrate dev`（在 packages/backend 下，`DATABASE_URL` 指向测试库）同步 schema

### 测试脚本

- 根 `package.json`：`"test": "pnpm -r --parallel run test"`
- 后端 `package.json`：`"pretest": "pnpm --filter @taskora/shared build && prisma generate"`（自动构建 shared + 生成 Prisma Client）
- 后端 `package.json`：`"test": "vitest run"`

### 质量门

- `pnpm lint` + `pnpm typecheck` + `pnpm test` 必须全部通过
- 后端 `tsconfig.json` 仅 include `src/`，测试文件不在 `tsc --noEmit` 检查范围（test 文件在 `src` 之外，vitest 自行转译）
- 添加新 Service 时建议同步编写 `*.spec.ts` 单测（mock PrismaService）
- 添加新 Controller endpoint 时建议编写 `*.e2e-spec.ts`（真实 DB + supertest）

---

## Docker 部署注意事项

### main.ts 启动时调用 pnpm

`main.ts` 在 `runDatabaseMigrations()` 中执行 `execSync('pnpm exec prisma migrate deploy')`。因此 backend Dockerfile 的 runtime 阶段必须执行 `RUN corepack enable`，否则容器启动时 `pnpm` 命令不存在，migration 失败导致进程退出。

### 构建上下文 = 仓库根目录

Backend 和 frontend 的 Dockerfile 都放在各自包目录下（`packages/backend/Dockerfile`、`packages/frontend/Dockerfile`），但构建上下文必须是仓库根目录（`docker build -f packages/backend/Dockerfile .`），因为两者都依赖 `packages/shared`（workspace 依赖，不发包）。

### Docker Compose 服务名即网络主机名

`docker-compose.yml` 中 `DATABASE_URL` 的 PostgreSQL host 必须是 compose 服务名 `postgres`，而非 `localhost`。backend 和 frontend 通过 compose 内部网络通信，frontend nginx.conf 中 `proxy_pass http://backend:3000` 同理。

## Code Review Checklist

- [ ] 所有 Prisma 查询包含 userId 隔离
- [ ] DTO 从 `@taskora/shared` 引用，不重复定义
- [ ] 输入校验（class-validator 装饰器）已添加
- [ ] 修改全局前缀时，所有 cookie path 已同步
- [ ] `pnpm lint` 和 `pnpm typecheck` 通过
