# Execution Plan: Taskora GTD Application

## Overview

Parent task 执行计划。实际实现工作在 child tasks 中进行。本文件定义执行顺序、验证命令、review gate 和 rollback 点。

## Execution Order

```
01-monorepo-setup
       │
       ├──▶ 02-backend-core  ┐
       │                      ├──▶ 04-frontend-views
       └──▶ 03-frontend-core ┘
```

- `01` 必须先完成（所有后续任务依赖 workspace 与 shared 包）
- `02` 与 `03` 可并行
- `04` 依赖 `02`（API）+ `03`（脚手架与 API 层）

---

## Phase 1: Monorepo Setup (`01-monorepo-setup`)

### Checklist

- [ ] 初始化 pnpm workspace（`pnpm-workspace.yaml`）
- [ ] 创建根 `package.json`（scripts: dev, lint, format, typecheck）
- [ ] 创建 `tsconfig.base.json`（共享 TS 配置）
- [ ] 创建 `packages/shared`（package.json, tsconfig, src/index.ts 导出示例类型）
- [ ] 创建 `packages/backend` 目录占位（仅 package.json + tsconfig 引用 shared）
- [ ] 创建 `packages/frontend` 目录占位（仅 package.json + tsconfig 引用 shared）
- [ ] 配置根 ESLint（TypeScript + flat config）
- [ ] 配置根 Prettier
- [ ] `.gitignore`（node_modules, dist, .env, .env.local 等）
- [ ] 验证 `pnpm install` 成功
- [ ] 验证 backend/frontend 可 import shared 包

### Validation

```bash
pnpm install
pnpm lint
pnpm typecheck
# 验证 shared 可被引用：
node -e "console.log(require('./packages/shared'))"
```

### Rollback Point

此阶段纯基础设施，如遇阻可删除 `packages/` 内容重来，无数据损失风险。

---

## Phase 2a: Backend Core (`02-backend-core`)

### Checklist

- [ ] NestJS 初始化（`packages/backend`，`@nestjs/cli`）
- [ ] Prisma 初始化 + schema 定义（User, Area, Project, Task + enums）
- [ ] Prisma migration 执行
- [ ] PrismaService 封装（继承 PrismaClient, lifecycle hooks）
- [ ] Auth 模块：
  - [ ] RegisterDto, LoginDto（class-validator）
  - [ ] AuthService（bcrypt hash, JWT 签发）
  - [ ] JwtStrategy + JwtAuthGuard
  - [ ] AuthController（/auth/register, /auth/login, /auth/me）
- [ ] Tasks 模块：
  - [ ] CreateTaskDto, UpdateTaskDto, TaskQueryDto
  - [ ] TasksService（CRUD + bucket 转换逻辑 + 用户隔离）
  - [ ] TasksController（REST 端点 + query 参数过滤）
- [ ] Projects 模块（CRUD + 用户隔离）
- [ ] Areas 模块（CRUD + 用户隔离）
- [ ] 全局 ValidationPipe
- [ ] 全局异常过滤器
- [ ] Prisma seed 脚本（测试用户 + 示例数据）
- [ ] CORS 配置（允许前端 dev origin）
- [ ] 端到端手动验证（curl / HTTP client）

### Validation

```bash
cd packages/backend
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
# curl 测试：
curl -X POST http://localhost:3000/auth/register -d '{...}'
curl -X POST http://localhost:3000/auth/login -d '{...}'
curl -H "Authorization: Bearer <token>" http://localhost:3000/tasks?view=inbox
```

### Review Gate

- Prisma schema 是否与 design.md §2 一致
- 所有查询是否包含 userId 隔离
- bucket 转换逻辑是否覆盖所有 case

### Rollback Point

- Migration 失败：`pnpm prisma migrate reset`
- Schema 设计错误：修改 schema → 重新 migrate

---

## Phase 2b: Frontend Core (`03-frontend-core`)

### Checklist

- [ ] Vite + React + TypeScript 初始化（`packages/frontend`）
- [ ] Tailwind CSS 配置
- [ ] shadcn/ui 初始化 + 基础组件（Button, Input, Dialog, DropdownMenu, Checkbox）
- [ ] React Router 配置（路由表见 design.md §5.2）
- [ ] Axios 实例 + 拦截器（JWT 附带、401 跳转）
- [ ] Zustand auth store（token, user, login, logout）
- [ ] TanStack Query 配置（QueryClient, QueryClientProvider）
- [ ] API 封装：auth.api, tasks.api, projects.api, areas.api
- [ ] TanStack Query hooks：useAuth, useTasks, useProjects, useAreas
- [ ] 登录页 UI + 逻辑
- [ ] 注册页 UI + 逻辑
- [ ] ProtectedRoute 组件
- [ ] AppShell 布局（Sidebar + MainContent）
- [ ] 侧边栏导航项占位（所有视图）
- [ ] 验证与后端联调（需 02 至少有 auth + tasks 基本端点可用）

### Validation

```bash
cd packages/frontend
pnpm dev
# 手动验证：
# 1. 访问 /login，注册新用户
# 2. 登录成功后跳转 /today
# 3. token 存储在 localStorage/Zustand
# 4. 刷新页面后仍保持登录
# 5. 登出后跳转 /login
```

### Rollback Point

- 脚手架错误可删除 `packages/frontend/src` 重新初始化
- shadcn/ui 配置问题可重新 `npx shadcn-ui@latest init`

---

## Phase 3: Frontend Views (`04-frontend-views`)

### Checklist

- [ ] TaskItem 组件（复选框、标题、日期、project/area 标签）
- [ ] TaskList 组件（列表渲染、空状态）
- [ ] QuickAddTask 组件（输入框、回车提交）
- [ ] TaskCheckbox 组件（完成动画）
- [ ] TaskDetail 组件（编辑标题/备注、设置日期、管理子任务）
- [ ] TaskContextMenu 组件（右键：完成、删除）
- [ ] Inbox 页面
- [ ] Today 页面
- [ ] Upcoming 页面（按日期分组）
- [ ] Anytime 页面
- [ ] Someday 页面
- [ ] Projects 页面（列表 + 创建/编辑/删除）
- [ ] ProjectDetail 页面（项目下任务列表）
- [ ] Areas 页面（列表 + 创建/编辑/删除）
- [ ] AreaDetail 页面（区域下任务与项目）
- [ ] Trash 页面（恢复 + 永久删除）
- [ ] 配色与视觉打磨（Things3 风格）
- [ ] 过渡动画（任务完成动画、页面切换）
- [ ] 响应式基础（桌面优先，移动端不破裂）

### Validation

```bash
cd packages/frontend
pnpm dev
# 全流程手动验证：
# 1. 在 Inbox 快速添加任务
# 2. 设置 dueDate → 任务出现在 Today
# 3. 创建 Project → 将任务分配到 Project → 任务出现在 Anytime
# 4. 将任务移到 Someday → 出现在 Someday
# 5. 完成任务 → 动画 → 任务消失
# 6. 删除任务 → 出现在 Trash → 恢复
# 7. 创建 Area → 将 Project 分配到 Area
# 8. 切换视图验证数据一致
```

### Review Gate

- 所有 MVP 视图是否可用
- 视觉是否接近 Things3 风格
- 任务 bucket 转换在 UI 层是否正确反映
- 子任务管理是否正常

### Rollback Point

- 单个页面问题：回退该页面组件
- 全局样式问题：回退 Tailwind/shadcn 配置

---

## Cross-Cutting Validation

在每个 child task 完成后运行：

```bash
# 根级
pnpm lint
pnpm typecheck
```

最终集成验证（04 完成后）：

- [ ] 前后端联调完整流程通过
- [ ] 认证流程端到端正常
- [ ] 任务 CRUD + 视图切换 + bucket 转换正确
- [ ] 项目与区域管理正常
- [ ] 废纸篓恢复正常
- [ ] 视觉风格验收

---

## Risk Register

| 风险                                   | 概率 | 影响 | 缓解                                      |
| -------------------------------------- | ---- | ---- | ----------------------------------------- |
| Prisma schema 设计不足导致频繁 migrate | 中   | 中   | 在 02 开始前 review design.md 数据模型    |
| shadcn/ui 组件与 Tailwind 版本冲突     | 低   | 中   | 锁定版本，按官方文档初始化                |
| bucket 转换逻辑遗漏边界 case           | 中   | 中   | 在 02 service 层写清楚转换表，01 review   |
| 前后端并行时 API 契约不一致            | 中   | 中   | 严格从 shared 包引用 DTO 类型             |
| Things3 视觉风格还原度不足             | 中   | 低   | 先功能后视觉，UI 打磨作为最后的 checklist |

---

## Spec / Research Manifest（Sub-agent 模式）

`implement.jsonl` 和 `check.jsonl` 需要在每个 child task 启动前 curate。优先包含：

- `.trellis/spec/backend/directory-structure.md`
- `.trellis/spec/backend/database-guidelines.md`
- `.trellis/spec/backend/error-handling.md`
- `.trellis/spec/backend/logging-guidelines.md`
- `.trellis/spec/backend/quality-guidelines.md`
- `.trellis/spec/frontend/directory-structure.md`
- `.trellis/spec/frontend/component-guidelines.md`
- `.trellis/spec/frontend/hook-guidelines.md`
- `.trellis/spec/frontend/state-management.md`
- `.trellis/spec/frontend/type-safety.md`
- `.trellis/spec/frontend/quality-guidelines.md`
- `.trellis/spec/guides/cross-layer-thinking-guide.md`
- `.trellis/spec/guides/code-reuse-thinking-guide.md`

注意：当前 `00-bootstrap-guidelines` 任务尚未完成，spec 文件可能仍为空模板。**建议先完成 spec 填充再启动实现任务**，否则 sub-agent 会生成不符合约定的代码。
