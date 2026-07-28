# Directory Structure

> How backend code is organized in this project.

---

## Overview

后端代码位于 `packages/backend/`，使用 NestJS 框架。模块化组织，每个业务域一个模块（auth、users、tasks、projects、areas、tags、tag-groups）。

---

## Directory Layout

```
packages/backend/
├── package.json          # @taskora/backend, dep @taskora/shared: workspace:*
├── tsconfig.json         # extends ../../tsconfig.base.json
├── prisma/
│   ├── schema.prisma     # 数据模型定义
│   └── seed.ts           # 种子数据脚本
└── src/
    ├── main.ts            # 应用入口（enableCors + cookieParser + ValidationPipe + 全局过滤器）
    ├── app.module.ts      # 根模块
    ├── prisma/            # PrismaClient 封装
    │   ├── prisma.module.ts
    │   └── prisma.service.ts
    ├── auth/              # 认证模块（登录/注册/refresh/logout/me）
    │   ├── auth.module.ts
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   ├── jwt.strategy.ts
    │   ├── jwt-auth.guard.ts
    │   ├── refresh-token.helpers.ts  # RT cookie 选项、生成/哈希工具
    │   └── dto/
    ├── users/             # 用户自我管理模块（profile / password）
    │   ├── users.module.ts
    │   ├── users.controller.ts
    │   ├── users.service.ts
    │   └── dto/
    ├── tasks/             # 任务模块
    │   ├── tasks.module.ts
    │   ├── tasks.controller.ts
    │   ├── tasks.service.ts
    │   └── dto/
    ├── projects/          # 项目模块
    │   ├── projects.module.ts
    │   ├── projects.controller.ts
    │   ├── projects.service.ts
    │   └── dto/
    ├── areas/             # 区域模块
    │   ├── areas.module.ts
    │   ├── areas.controller.ts
    │   ├── areas.service.ts
    │   └── dto/
    ├── tags/              # 标签模块
    │   ├── tags.module.ts
    │   ├── tags.controller.ts
    │   ├── tags.service.ts
    │   └── dto/
    ├── tag-groups/        # 标签分组模块
    │   ├── tag-groups.module.ts
    │   ├── tag-groups.controller.ts
    │   ├── tag-groups.service.ts
    │   └── dto/
    └── common/            # 跨模块共享
        └── filters/       # 全局异常过滤器
```

---

## Module Organization

- **每个业务域一个模块**：auth、users、tasks、projects、areas、tags、tag-groups 各自独立
- **模块内分层**：controller（路由）→ service（业务逻辑）→ dto（数据传输对象）
- **DTO 从 shared 包引用**：`import { CreateTaskDto } from '@taskora/shared'`，避免重复定义
- **Prisma 作为基础设施模块**：包装 PrismaClient，注入到各 service
- **认证模块含 refresh token**：`auth/` 除了 register/login/me 外，还有 `POST /auth/refresh`（HttpOnly cookie 轮换）和 `POST /auth/logout`（吊销 RT）
- **用户自我管理独立模块**：`users/` 提供 `PUT /users/me`（改 profile）和 `PUT /users/me/password`（改密码），与 auth 注册/登录分离

---

## Naming Conventions

- 文件：`kebab-case`（如 `tasks.controller.ts`）
- 类：`PascalCase`（如 `TasksController`、`TasksService`）
- 模块文件：`<name>.module.ts`、`<name>.controller.ts`、`<name>.service.ts`

---

## Common Mistakes

### 数据隔离

**Symptom**: 用户 A 能通过 `GET /tasks/:id` 访问到用户 B 的任务

**Cause**: Service 层仅用 `id` 查询，未带 `userId`

**Fix**: 所有业务 Prisma where 子句必须包含 `userId`（`RefreshToken` 表的 `tokenHash` 查询是唯一例外，详见 database-guidelines.md）：

```typescript
// Correct — findFirst 带 userId 隔离
prisma.task.findFirst({ where: { id, userId } })

// Wrong — findUnique 仅用 id，可越权访问
prisma.task.findUnique({ where: { id } })
```

> `RefreshToken` 表按 `tokenHash` 唯一查找是设计如此（RT 本身即凭证），不属于用户业务数据隔离范围。

**Prevention**: Code review 时检查所有查询是否包含 userId 隔离。

---

## Examples

- 目录结构来源：`.trellis/tasks/07-25-gtd-app/design.md` §4.1