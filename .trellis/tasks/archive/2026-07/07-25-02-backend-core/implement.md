# Backend Core - Execution Plan

## Checklist

### 1. NestJS 初始化
- [ ] 在 `packages/backend` 用 NestJS CLI 初始化项目（或手动搭建）
- [ ] 安装依赖：@nestjs/core, @nestjs/common, @nestjs/platform-express, reflect-metadata, rxjs
- [ ] 安装 dev 依赖：@nestjs/cli, ts-node, tsconfig-paths
- [ ] 配置 NestJS 的 tsconfig.json（继承根 base，加 decorator metadata）
- [ ] main.ts：启动 NestApplication，启用 CORS（允许 localhost:5173），全局 ValidationPipe

### 2. Prisma 设置
- [ ] 安装 prisma（dev）+ @prisma/client
- [ ] `prisma init`
- [ ] 编写 schema.prisma（User, Area, Project, Task + enums，见 design.md §2.1）
- [ ] 配置 DATABASE_URL（`.env` 文件用 peer 认证连接字符串）
- [ ] `prisma migrate dev --name init`
- [ ] 编写 PrismaService（继承 PrismaClient，onModuleInit/onModuleDestroy）
- [ ] 编写 PrismaModule（global module，导出 PrismaService）

### 3. Auth 模块
- [ ] 安装依赖：@nestjs/jwt, passport, passport-jwt, bcrypt, class-validator, class-transformer
- [ ] DTO：RegisterDto（email, password）、LoginDto（email, password）
- [ ] AuthService：register（bcrypt hash + prisma.user.create）、login（verify + jwt.sign）、validateUser
- [ ] JwtStrategy：从 token 提取 userId，返回 user 对象
- [ ] JwtAuthGuard
- [ ] AuthController：POST /auth/register, POST /auth/login, GET /auth/me
- [ ] 注册后返回 { id, email }；登录后返回 { accessToken, user: { id, email } }

### 4. Tasks 模块
- [ ] DTO：CreateTaskDto, UpdateTaskDto, TaskQueryDto（从 shared 引用，或用 class-validator 装饰器包装）
- [ ] TasksService：
  - [ ] create：创建任务，应用 bucket 转换逻辑
  - [ ] findAll：按 query 参数过滤（view, projectId, areaId, parentId, completed）
  - [ ] findOne：按 id + userId 查询
  - [ ] update：更新任务，应用 bucket 转换逻辑
  - [ ] remove：软删除（status → TRASHED, trashedAt = now）
  - [ ] restore：恢复（status → ACTIVE, trashedAt = null）
  - [ ] complete / uncomplete：标记完成/取消完成
  - [ ] 视图查询逻辑（inbox/today/upcoming/anytime/someday/trash）
- [ ] TasksController：REST 端点见 design.md §3.1
- [ ] 所有查询包含 userId 隔离

### 5. Projects 模块
- [ ] ProjectsService：create, findAll, findOne, update, remove（全部带 userId 隔离）
- [ ] ProjectsController：REST 端点

### 6. Areas 模块
- [ ] AreasService：create, findAll, findOne, update, remove（全部带 userId 隔离）
- [ ] AreasController：REST 端点

### 7. Common
- [ ] 全局 ValidationPipe（whitelist, transform, forbidNonWhitelisted）
- [ ] 全局异常过滤器（Prisma errors → HTTP status, ZodError 等 → 400）
- [ ] 所有 vsoc 隔离检查

### 8. Seed 脚本
- [ ] prisma/seed.ts：创建测试用户 + 示例 area/project/task
- [ ] package.json 配置 prisma.seed

### 9. Validation
- [ ] `pnpm --filter backend lint` 通过
- [ ] `pnpm --filter backend typecheck` 通过
- [ ] `pnpm --filter backend dev` 启动成功
- [ ] curl 测试：注册 → 登录 → 创建任务 → 查询各视图
- [ ] 数据库 migration 可执行

## Rollback Points
- Schema 错误：`prisma migrate reset`
- 模块错误：回退该模块文件