# GTD MVP 增强：Tags + Logbook + 测试基建

## Goal

在已交付的 Taskora MVP（Inbox/Today/Upcoming/Anytime/Someday/Projects/Areas/Trash 八大视图 + 任务 CRUD + 子任务 + 截止日期）基础上，补齐 PRD 中列为"MVP 暂缓"的三个增量：标签 Tags、日志 Logbook，并建立覆盖前后端的测试基建，为后续重构与功能扩展提供安全网。

## Background

- MVP 已归档完成（07-25-gtd-app 父任务及四个子任务全部 archive）
- 现有代码：NestJS + Prisma + PostgreSQL 后端；React + Vite + Tailwind + shadcn/ui 前端；pnpm monorepo（backend / frontend / shared）
- 现有 schema：User / Task / Project / Area，Task 含 bucket / status / dueDate / parentId / sortOrder
- Task 完成动作已存在（`POST /tasks/:id/complete` → status=COMPLETED, completedAt=now），Logbook 基于此构建
- 现有测试：全仓 0 个测试文件，无测试运行器配置

## Requirements

### 功能需求

#### Tags（标签）

- 标签为**用户级**：一个用户一套标签，跨项目/区域共用
- 标签**带颜色**（用户可选颜色）
- 标签**可分组**：标签可归属于某个标签分组（TagGroup），分组也可独立管理；无分组的标签归入"未分组"
- 任务可贴**多个标签**（多对多）
- 前端提供**按标签筛选**入口（侧栏 + 任务列表筛选）

#### Logbook（日志）

- Logbook **只展示已完成任务**（status=COMPLETED）
- 任务完成即进 Logbook（无需等待归档计时；`complete` 动作已有）
- **支持取消归档**：在 Logbook 中可将任务取消完成，回到原 bucket（即现有 `uncomplete` 动作）
- Logbook 按完成时间倒序展示，支持按日期分组

#### 测试基建

- 后端：Service 层单测 + Controller e2e 测试（NestJS `Test.createTestingModule`）
- 前端：hooks 测试 + 关键组件测试（Vitest + Testing Library）
- 测试数据库：每个测试隔离的 PostgreSQL schema（testcontainers 或 per-test schema 隔离）

### 技术约束

- 沿用现有技术栈，不引入新框架
- shared 包继续承担前后端共享类型契约
- 数据库变更通过 Prisma migration
- 保持现有 ValidationPipe（whitelist + transform + forbidNonWhitelisted）与 AllExceptionsFilter 约定

## Task Map

| Child Task | 范围 | 验收边界 | 依赖 |
|---|---|---|---|
| `test-infra` | Vitest + Testing Library（前端）/ Jest + supertest 或 NestJS Testing（后端）/ 测试 DB 策略 / 示例 service 单测 + 示例 hook 测试 / `pnpm test` 串联 | 全仓 `pnpm test` 可跑通，至少每个包各有一个 green 测试；测试 DB 隔离生效 | 无 |
| `tags` | Tag + TagGroup Prisma model + migration；shared DTO；Tags Module（CRUD + 分组）；Task-Tag 关联 + 任务贴标签 API；前端 Tags 侧栏、标签管理、TaskDetail 贴标签、列表筛选 | 标签可创建/编辑/删除/分组；任务可贴多标签；按标签筛选列表；migration 可执行 | `test-infra`（为其提供验证） |
| `logbook` | TasksService `findAll` 增加 `logbook` view；前端 Logbook 页面（按完成日期分组）；取消归档操作复用 uncomplete；侧栏入口 | 完成任务出现在 Logbook；按完成日期倒序分组；取消归档可回到原视图 | `test-infra` |

**执行顺序**：`test-infra` → `tags` + `logbook`（可并行）→ 集成验证

## Cross-Child Acceptance Criteria

- [ ] `pnpm test` 在根目录跑通全部三个包的测试
- [ ] Tags migration 与 Logbook 共存于同一 Prisma schema，无冲突
- [ ] 完成的带标签任务在 Logbook 中仍显示其标签
- [ ] Logbook 中取消归档的任务回到原 bucket 并保留标签关联
- [ ] 三个子任务各自独立归档，父任务最终整合 review 通过

## Out of Scope

- 重复任务
- 提醒通知（Web Push / 本地通知）
- OAuth 社交登录
- 拖拽排序（`sortOrder` 字段已存在，UI 消费留后续）
- 暗色主题切换
- E2E（Playwright）测试

## Open Questions

- 无（所有决策已在父任务对话中明确）