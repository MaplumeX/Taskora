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

### Service 层
- `@Injectable()` 装饰，构造函数注入 `PrismaService`（及 `JwtService` 等）
- 业务方法第一个参数恒为 `userId: string`，所有 Prisma where 必须含 `userId`
- 业务错误用 NestJS HttpException 子类（`NotFoundException`/`ConflictException`/`UnauthorizedException`）抛出，不返回 `null` 表示错误
- 软删除优先：Task 用 `status: TRASHED` + `trashedAt`，不用 `prisma.task.delete`

### DTO
- DTO 定义在 `@taskora/shared`，模块内 `dto/` 文件重导出（`export { CreateTaskDto } from '@taskora/shared'`），避免后端内重复定义
- 用 `class-validator` 装饰器（`@IsEmail`/`@MinLength` 等），配合全局 `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
- `@Query()` 参数对应单一 DTO class，不可用交叉类型（见 error-handling.md 常见错误）

---

## Testing Requirements

**当前状态**：项目尚未建立测试套件。
- `packages/backend/package.json` 无 `test` 脚本
- 无 `*.spec.ts` 文件，无 Jest/Vitest 依赖
- 质量门目前依赖：`pnpm lint` + `pnpm typecheck`（根 `package.json`）

> 未来引入测试时再更新本节。在此之前的约定：
- 新增 service 逻辑保持纯函数倾向（如 `resolveBucket` 这类私有方法便于后续单测）
- 不为追求覆盖率而临时补测试，测试随功能引入

---

## Code Review Checklist

- [ ] 所有 Prisma 查询包含 userId 隔离
- [ ] DTO 从 `@taskora/shared` 引用，不重复定义
- [ ] 输入校验（class-validator 装饰器）已添加
- [ ] `pnpm lint` 和 `pnpm typecheck` 通过
