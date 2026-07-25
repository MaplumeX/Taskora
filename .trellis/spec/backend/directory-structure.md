# Directory Structure

> How backend code is organized in this project.

---

## Overview

后端代码位于 `packages/backend/`，使用 NestJS 框架。模块化组织，每个业务域一个模块（auth、tasks、projects、areas）。

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
    ├── main.ts            # 应用入口
    ├── app.module.ts      # 根模块
    ├── prisma/            # PrismaClient 封装
    │   ├── prisma.module.ts
    │   └── prisma.service.ts
    ├── auth/              # 认证模块
    │   ├── auth.module.ts
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   ├── jwt.strategy.ts
    │   ├── jwt-auth.guard.ts
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
    └── common/            # 跨模块共享
        ├── filters/       # 全局异常过滤器
        └── interceptors/  # 日志等
```

---

## Module Organization

- **每个业务域一个模块**：auth、tasks、projects、areas 各自独立
- **模块内分层**：controller（路由）→ service（业务逻辑）→ dto（数据传输对象）
- **DTO 从 shared 包引用**：`import { CreateTaskDto } from '@taskora/shared'`，避免重复定义
- **Prisma 作为基础设施模块**：包装 PrismaClient，注入到各 service

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

**Fix**: 所有 Prisma where 子句必须包含 `userId`：

```typescript
// Correct
prisma.task.findUnique({ where: { id, userId } })

// Wrong
prisma.task.findUnique({ where: { id } })
```

**Prevention**: Code review 时检查所有查询是否包含 userId 隔离。

---

## Examples

- 目录结构来源：`.trellis/tasks/07-25-gtd-app/design.md` §4.1