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
- **logout/refresh 失败**：`res.clearCookie(RT_COOKIE_NAME, { path: '/auth' })` 清理 cookie。

```typescript
@Post('login')
async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
  const { accessToken, rt, user } = await this.authService.login(dto);
  res.cookie(RT_COOKIE_NAME, rt, COOKIE_OPTS);  // HttpOnly，前端读不到
  return { accessToken, user };                  // 只返回 accessToken
}
```

RT cookie 选项统一在 `refresh-token.helpers.ts`：`httpOnly: true, sameSite: 'lax', path: '/auth'`，`secure` 仅生产环境。不散落各处。

### 用户自管端点

`UsersController` 提供 `PUT /users/me`（profile 字段部分更新）和 `PUT /users/me/password`（改密码）。与 auth 注册/登录分离，避免 auth 模块职责过重。改密码需验证 `currentPassword`（bcrypt.compare），改 profile 字段用部分更新（仅传入字段才更新）。

### Service 层
- `@Injectable()` 装饰，构造函数注入 `PrismaService`（及 `JwtService` 等）
- 业务方法第一个参数恒为 `userId: string`，所有 Prisma where 必须含 `userId`
- 业务错误用 NestJS HttpException 子类（`NotFoundException`/`ConflictException`/`UnauthorizedException`）抛出，不返回 `null` 表示错误
- 软删除优先：Task 用 `status: TRASHED` + `trashedAt`，`RefreshToken` 用 `revokedAt`，均不用 `prisma.*.delete`
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

## Code Review Checklist

- [ ] 所有 Prisma 查询包含 userId 隔离
- [ ] DTO 从 `@taskora/shared` 引用，不重复定义
- [ ] 输入校验（class-validator 装饰器）已添加
- [ ] `pnpm lint` 和 `pnpm typecheck` 通过
