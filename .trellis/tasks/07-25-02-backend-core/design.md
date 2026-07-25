# Backend Core - Technical Design

## 概述

搭建 NestJS 后端：Prisma 数据模型、邮箱密码认证（JWT）、任务/项目/区域 CRUD REST API。

参考 parent design.md §2（数据模型）、§3（API 契约）、§4（后端架构）。

## 数据库连接

- PostgreSQL 已就绪：`localhost:5433`，数据库 `taskora`，用户 `maplume`，peer 认证
- `DATABASE_URL=postgresql:///taskora?host=/var/run/postgresql&port=5433`

## Prisma Schema

见 parent `design.md` §2.1。关键模型：
- User（id, email, passwordHash, timestamps）
- Area（id, title, notes, userId, timestamps）
- Project（id, title, notes, userId, areaId?, timestamps）
- Task（id, title, notes, dueDate, bucket, status, completedAt, trashedAt, sortOrder, userId, parentId?, projectId?, areaId?, timestamps）
- Enum: TaskBucket (INBOX, ANYTIME, SOMEDAY, SCHEDULED), TaskStatus (ACTIVE, COMPLETED, TRASHED)

## Bucket 转换逻辑

见 parent `design.md` §2.3。在 TasksService 中实现：
- 设 dueDate → bucket = SCHEDULED
- 清除 dueDate → bucket 回 INBOX 或 ANYTIME（取决于是否有 project/area）
- 分配 project/area（无 dueDate）→ bucket = ANYTIME
- 移到 Someday → bucket = SOMEDAY

## 模块结构

见 parent `design.md` §4.1。模块：prisma、auth、tasks、projects、areas、common。

## 认证

见 parent `design.md` §4.2。bcrypt hash + JWT（7 天有效期）+ JwtAuthGuard。

## API 端点

见 parent `design.md` §3.1-3.2。所有端点按当前用户隔离。