# Backend Core

## Goal

搭建 NestJS 后端核心：数据模型、认证系统、任务 CRUD REST API，为前端提供完整的数据服务。

## Background

- Parent task: `07-25-gtd-app`
- 依赖 `01-monorepo-setup` 完成
- 技术栈：Node.js + NestJS + TypeScript + PostgreSQL + Prisma ORM

## Requirements

### NestJS 项目

- NestJS 项目初始化在 `packages/backend`
- 模块化结构（auth、tasks、projects、areas 模块）

### 数据模型（Prisma Schema）

- **User**：id、email、passwordHash、createdAt、updatedAt
- **Task**：id、title、notes、dueDate、completedAt、createdAt、updatedAt、userId、parentId（自关联，子任务）、projectId、areaId
- **Project**：id、title、notes、createdAt、updatedAt、userId、areaId（可选，项目可属于区域）
- **Area**：id、title、notes、createdAt、updatedAt、userId

### 认证

- 邮箱 + 密码注册（bcrypt hash）
- 邮箱 + 密码登录，返回 JWT
- JWT 守卫保护所有业务路由
- 当前用户通过 token 解析

### 任务 CRUD REST API

- `POST /tasks` — 创建任务（支持指定 project/area/parent）
- `GET /tasks` — 查询任务（支持按 inbox/today/upcoming/anytime/someday/project/area 过滤）
- `GET /tasks/:id` — 获取单个任务
- `PATCH /tasks/:id` — 更新任务（标题、备注、日期、完成状态、移动到 project/area）
- `DELETE /tasks/:id` — 软删除（移入废纸篓）
- `POST /tasks/:id/restore` — 从废纸篓恢复
- 所有查询按当前用户隔离

### 项目与区域

- `POST /projects`、`GET /projects`、`PATCH /projects/:id`、`DELETE /projects/:id`
- `POST /areas`、`GET /areas`、`PATCH /areas/:id`、`DELETE /areas/:id`

### 数据安全

- 所有业务查询都按 `userId` 隔离
- 密码使用 bcrypt hash，不返回 passwordHash
- 输入校验（class-validator / DTO）

## Acceptance Criteria

- [ ] Prisma migration 可执行，数据库 schema 符合设计
- [ ] 注册 `POST /auth/register` 可创建用户，密码被 hash
- [ ] 登录 `POST /auth/login` 返回 JWT
- [ ] 受保护路由无 token 时返回 401
- [ ] 任务 CRUD 全部端点正常工作
- [ ] 任务查询按 viewport（inbox/today/upcoming/anytime/someday）正确过滤
- [ ] 子任务（parentId）创建与查询正常
- [ ] 项目与区域 CRUD 正常
- [ ] 所有数据按用户隔离，无法访问他人数据
- [ ] Prisma seed 脚本可填充测试数据

## Out of Scope

- 标签系统
- 重复任务
- 提醒通知
- 日志 Logbook（已完成任务归档查询，后续加）
- OAuth 社交登录

## Open Questions

- 无
