# Technical Design: Taskora GTD Application

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    pnpm monorepo                        │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────────┐ │
│  │ frontend │   │ backend  │   │       shared         │ │
│  │  (React) │   │ (NestJS) │   │ (types/enums/dto)    │ │
│  │  :5173   │──▶│  :3000   │   │                      │ │
│  └──────────┘   └────┬─────┘   └──────────────────────┘ │
│                      │                                  │
│                      ▼                                  │
│                ┌─────────────┐                          │
│                │ PostgreSQL  │                          │
│                │   :5432     │                          │
│                └─────────────┘                          │
└─────────────────────────────────────────────────────────┘
```

### 1.2 包职责边界

| 包         | 职责                                    | 不做                                 |
| ---------- | --------------------------------------- | ------------------------------------ |
| `shared`   | DTO、枚举、常量、类型定义；无运行时逻辑 | 业务逻辑、API 调用                   |
| `backend`  | API 服务、数据持久化、认证、业务逻辑    | UI 渲染、路由（前端意义上的）        |
| `frontend` | UI 渲染、用户交互、API 调用、状态管理   | 数据持久化、业务规则验证（信任后端） |

### 1.3 通信方式

- 前端 ↔ 后端：REST API（JSON over HTTP）
- 前端 ↔ shared：TypeScript import
- 后端 ↔ shared：TypeScript import
- 后端 ↔ 数据库：Prisma ORM

---

## 2. Data Model

### 2.1 Prisma Schema 概览

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  tasks        Task[]
  projects     Project[]
  areas        Area[]
}

model Area {
  id        String   @id @default(uuid())
  title     String
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  projects  Project[]
  tasks     Task[]
}

model Project {
  id        String   @id @default(uuid())
  title     String
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  areaId    String?
  area      Area?    @relation(fields: [areaId], references: [id])
  tasks     Task[]
}

enum TaskStatus {
  ACTIVE      // 活跃任务
  COMPLETED   // 已完成
  TRASHED     // 在废纸篓中
}

enum TaskBucket {
  INBOX      // 无 project/area，无 dueDate
  ANYTIME    // 有 project/area，无 dueDate
  SOMEDAY    // 标记为某天
  SCHEDULED  // 有 dueDate（进入 Today 或 Upcoming）
}

model Task {
  id          String      @id @default(uuid())
  title       String
  notes       String?
  dueDate     DateTime?
  bucket      TaskBucket  @default(INBOX)
  status      TaskStatus  @default(ACTIVE)
  completedAt DateTime?
  trashedAt   DateTime?
  sortOrder   Int         @default(0)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  userId      String
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  parentId    String?
  parent      Task?       @relation("TaskChildren", fields: [parentId], references: [id], onDelete: NoAction)
  children    Task[]      @relation("TaskChildren")

  projectId   String?
  project     Project?    @relation(fields: [projectId], references: [id])
  areaId      String?
  area        Area?       @relation(fields: [areaId], references: [id])
}
```

### 2.2 视图路由规则（任务如何进入各视图）

Task 的 `bucket` + `dueDate` + `status` 组合决定它出现在哪个视图：

| 视图     | 查询条件                                                       |
| -------- | -------------------------------------------------------------- |
| Inbox    | `bucket = INBOX` AND `status = ACTIVE` AND `dueDate IS NULL`   |
| Today    | `status = ACTIVE` AND (`dueDate <= today` )                    |
| Upcoming | `status = ACTIVE` AND `dueDate > today`，按 dueDate 分组       |
| Anytime  | `bucket = ANYTIME` AND `status = ACTIVE` AND `dueDate IS NULL` |
| Someday  | `bucket = SOMEDAY` AND `status = ACTIVE` AND `dueDate IS NULL` |
| Trash    | `status = TRASHED`                                             |

**关键设计**：`bucket` 是显式字段而非纯计算字段。原因：

- Things3 中，用户手动把任务拖到 Anytime/Someday，这是一个显意动作
- 设置 dueDate 时自动改为 `SCHEDULED`；清除 dueDate 时需要保持原 bucket 或回 INBOX
- 避免复杂隐式计算导致视图间任务"跳动"

### 2.3 任务 bucket 转换逻辑

| 用户操作                       | bucket 变化               |
| ------------------------------ | ------------------------- |
| 在 Inbox 创建任务              | `INBOX`                   |
| 给 Inbox 任务设 dueDate        | `SCHEDULED`               |
| 给 Inbox 任务分配 project/area | `ANYTIME`                 |
| 给 Anytime 任务设 dueDate      | `SCHEDULED`               |
| 清除 dueDate（原 INBOX）       | `INBOX`                   |
| 清除 dueDate（原 ANYTIME）     | `ANYTIME`                 |
| 移到 Someday                   | `SOMEDAY`（用户显式操作） |
| 从 Someday 设 dueDate          | `SCHEDULED`               |
| 完成任务                       | `status → COMPLETED`      |
| 删除任务                       | `status → TRASHED`        |

---

## 3. API Contract

### 3.1 REST 端点总览

#### Auth

| Method | Path             | Description      |
| ------ | ---------------- | ---------------- |
| POST   | `/auth/register` | 注册             |
| POST   | `/auth/login`    | 登录，返回 JWT   |
| GET    | `/auth/me`       | 获取当前用户信息 |

#### Tasks

| Method | Path                    | Description                  |
| ------ | ----------------------- | ---------------------------- |
| POST   | `/tasks`                | 创建任务                     |
| GET    | `/tasks`                | 查询任务（支持 filter 参数） |
| GET    | `/tasks/:id`            | 获取单个任务                 |
| PATCH  | `/tasks/:id`            | 更新任务                     |
| DELETE | `/tasks/:id`            | 软删除（移入废纸篓）         |
| POST   | `/tasks/:id/restore`    | 从废纸篓恢复                 |
| POST   | `/tasks/:id/complete`   | 标记完成                     |
| POST   | `/tasks/:id/uncomplete` | 取消完成                     |

#### Projects

| Method | Path            | Description  |
| ------ | --------------- | ------------ |
| POST   | `/projects`     | 创建项目     |
| GET    | `/projects`     | 列出项目     |
| GET    | `/projects/:id` | 获取单个项目 |
| PATCH  | `/projects/:id` | 更新项目     |
| DELETE | `/projects/:id` | 删除项目     |

#### Areas

| Method | Path         | Description  |
| ------ | ------------ | ------------ |
| POST   | `/areas`     | 创建区域     |
| GET    | `/areas`     | 列出区域     |
| GET    | `/areas/:id` | 获取单个区域 |
| PATCH  | `/areas/:id` | 更新区域     |
| DELETE | `/areas/:id` | 删除区域     |

### 3.2 查询参数

`GET /tasks` 支持的 query 参数：

| 参数        | 类型                                                        | 说明                            |
| ----------- | ----------------------------------------------------------- | ------------------------------- |
| `view`      | `inbox \| today \| upcoming \| anytime \| someday \| trash` | 视图过滤                        |
| `projectId` | string                                                      | 按项目过滤                      |
| `areaId`    | string                                                      | 按区域过滤                      |
| `parentId`  | string                                                      | 按父任务过滤（null = 顶层任务） |
| `completed` | boolean                                                     | 是否含已完成（默认 false）      |

### 3.3 共享 DTO（shared 包）

```typescript
// shared/src/dtos/task.dto.ts
export interface CreateTaskDto {
  title: string;
  notes?: string;
  dueDate?: string; // ISO 8601
  bucket?: TaskBucket;
  parentId?: string;
  projectId?: string;
  areaId?: string;
}

export interface UpdateTaskDto {
  title?: string;
  notes?: string;
  dueDate?: string | null;
  bucket?: TaskBucket;
  parentId?: string | null;
  projectId?: string | null;
  areaId?: string | null;
}

export interface TaskResponseDto {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  bucket: TaskBucket;
  status: TaskStatus;
  completedAt: string | null;
  trashedAt: string | null;
  sortOrder: number;
  parentId: string | null;
  projectId: string | null;
  areaId: string | null;
  children?: TaskResponseDto[];
  createdAt: string;
  updatedAt: string;
}

// shared/src/enums/task.enum.ts
export enum TaskBucket {
  INBOX = 'INBOX',
  ANYTIME = 'ANYTIME',
  SOMEDAY = 'SOMEDAY',
  SCHEDULED = 'SCHEDULED',
}

export enum TaskStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  TRASHED = 'TRASHED',
}
```

---

## 4. Backend Architecture

### 4.1 模块结构

```
packages/backend/src/
├── main.ts                    # 应用入口
├── app.module.ts             # 根模块
├── prisma/
│   ├── prisma.module.ts      # PrismaClient 包装
│   └── prisma.service.ts     # 继承 PrismaClient，onModuleInit/onModuleDestroy
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts    # /auth/register, /auth/login, /auth/me
│   ├── auth.service.ts       # 注册、登录、JWT 签发
│   ├── jwt.strategy.ts       # Passport JWT strategy
│   ├── jwt-auth.guard.ts     # JWT 守卫
│   └── dto/                  # RegisterDto, LoginDto
├── tasks/
│   ├── tasks.module.ts
│   ├── tasks.controller.ts   # /tasks CRUD
│   ├── tasks.service.ts      # 业务逻辑、bucket 转换
│   └── dto/                  # CreateTaskDto, UpdateTaskDto, TaskQueryDto
├── projects/
│   ├── projects.module.ts
│   ├── projects.controller.ts
│   ├── projects.service.ts
│   └── dto/
├── areas/
│   ├── areas.module.ts
│   ├── areas.controller.ts
│   ├── areas.service.ts
│   └── dto/
└── common/
    ├── filters/              # 全局异常过滤器
    └── interceptors/         # 日志等
```

### 4.2 认证流程

```
注册:
  POST /auth/register { email, password }
  → bcrypt.hash(password)
  → prisma.user.create()
  → 返回 { id, email }（不含 token，需单独登录）

登录:
  POST /auth/login { email, password }
  → prisma.user.findUnique({ email })
  → bcrypt.compare(password, user.passwordHash)
  → jwt.sign({ sub: user.id })
  → 返回 { accessToken, user }

受保护路由:
  Authorization: Bearer <token>
  → JwtStrategy.validate() → 注入 req.user
  → JwtAuthGuard 校验
```

### 4.3 数据隔离

- 所有 service 查询都接收 `userId`（从 `req.user` 提取）
- Prisma where 子句始终包含 `userId`
- 严禁仅用 `id` 查询（避免越权访问他人数据）

---

## 5. Frontend Architecture

### 5.1 目录结构

```
packages/frontend/src/
├── main.tsx                  # 入口
├── App.tsx                   # 根路由
├── router.tsx               # 路由配置
├── lib/
│   ├── api/                  # API 封装
│   │   ├── client.ts         # axios 实例（拦截器、baseURL）
│   │   ├── auth.api.ts       # 认证 API
│   │   ├── tasks.api.ts      # 任务 API
│   │   ├── projects.api.ts   # 项目 API
│   │   └── areas.api.ts      # 区域 API
│   ├── hooks/                # TanStack Query hooks
│   │   ├── useTasks.ts       # useTasksQuery, useCreateTask, useUpdateTask...
│   │   ├── useAuth.ts        # useLogin, useRegister, useCurrentUser
│   │   ├── useProjects.ts
│   │   └── useAreas.ts
│   ├── stores/               # Zustand stores
│   │   └── auth.store.ts     # token, user, isAuthenticated
│   └── utils/                # 工具函数
├── components/
│   ├── ui/                   # shadcn/ui 组件
│   ├── layout/
│   │   ├── AppShell.tsx      # 应用 shell（侧边栏 + 主区）
│   │   ├── Sidebar.tsx       # 侧边栏导航
│   │   └── MainContent.tsx   # 主内容区
│   ├── task/
│   │   ├── TaskItem.tsx      # 单个任务卡片
│   │   ├── TaskList.tsx      # 任务列表
│   │   ├── TaskDetail.tsx    # 任务详情（编辑、子任务）
│   │   ├── TaskCheckbox.tsx  # 复选框
│   │   ├── QuickAddTask.tsx  # 快速添加任务输入框
│   │   └── TaskContextMenu.tsx # 右键菜单
│   ├── project/
│   │   └── ...
│   └── area/
│       └── ...
├── pages/
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Inbox.tsx
│   ├── Today.tsx
│   ├── Upcoming.tsx
│   ├── Anytime.tsx
│   ├── Someday.tsx
│   ├── Projects.tsx
│   ├── ProjectDetail.tsx
│   ├── Areas.tsx
│   ├── AreaDetail.tsx
│   └── Trash.tsx
└── types/                    # 前端专用类型（非共享）
```

### 5.2 路由设计

```
/login                  → Login
/register               → Register
/                       → redirect to /today
/inbox                  → Inbox
/today                  → Today
/upcoming               → Upcoming
/anytime                → Anytime
/someday                → Someday
/projects               → Projects 列表
/projects/:id           → ProjectDetail
/areas                  → Areas 列表
/areas/:id              → AreaDetail
/trash                  → Trash
```

受保护路由用 `<ProtectedRoute>` 组件包裹，未登录跳转 `/login`。

### 5.3 状态管理分层

| 层             | 工具           | 存什么                                                       |
| -------------- | -------------- | ------------------------------------------------------------ |
| 服务端状态     | TanStack Query | tasks、projects、areas 数据（缓存、失效、乐观更新可选）      |
| 客户端 UI 状态 | Zustand        | auth（token、user）、当前选中的任务、UI 开关（侧边栏折叠等） |
| URL 状态       | React Router   | 当前视图、选中的 project/area id                             |

### 5.4 TanStack Query 策略

```typescript
// 默认配置
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s 内不重新请求
      refetchOnWindowFocus: true, // 回到应用时刷新
      retry: 1,
    },
  },
});

// Query Key 约定
['tasks', { view: 'inbox' }][('tasks', { view: 'today' })][('tasks', { projectId: 'xxx' })][
  ('task', taskId)
]['projects']['areas'];
```

**失效策略**：任务变更后 invalidate 相关 query：

- 创建/更新/删除任务 → `invalidateQueries(['tasks'])`
- 更新任务详情 → `invalidateQueries(['task', id])` + `invalidateQueries(['tasks'])`

---

## 6. Things3 视觉设计参考

### 6.1 配色

- 主色调：Things3 蓝 `#4477CE`（复选框、强调色）
- 背景：白色 `#FFFFFF`（主区域）、浅灰 `#F7F7F7`（侧边栏）
- 文字：深灰 `#333333`、次要 `#999999`
- 完成任务：删除线 + 浅灰
- 过期日期：红色 `#CC4444`

### 6.2 布局

- 侧边栏宽度 ~240px，固定
- 主内容区最大宽度 ~720px，居中
- 任务行高 ~48px
- 大量留白，Things3 的签名风格

### 6.3 交互

- 复选框：点击有弹性动画（勾选 → 填充 → 任务标题画删除线 → 淡出）
- 任务详情：右侧面板或模态弹窗
- 快速添加：回车提交，Esc 取消

---

## 7. 安全与数据隔离

### 7.1 认证与授权

- JWT 有效期：7 天（MVP 简化）
- 密码：bcrypt，salt rounds = 10
- JWT secret：通过环境变量 `JWT_SECRET` 注入
- 注册前邮箱格式校验 + 唯一性校验

### 7.2 数据隔离

- 所有 Prisma 查询的 `where` 包含 `userId`
- 不能仅用 `id` 查 task/project/area，必须同时带 `userId`
- 越权访问返回 404（不暴露资源是否存在）

### 7.3 输入校验

- NestJS `ValidationPipe` 全局启用
- DTO 使用 `class-validator` 装饰器
- 字段长度限制、格式校验（email、UUID 等）

---

## 8. 开发环境与部署

### 8.1 开发环境

```
Node.js >= 20
pnpm >= 9
PostgreSQL >= 15
```

环境变量（`.env`，后端）：

```
DATABASE_URL=postgresql://user:password@localhost:5432/taskora?schema=public
JWT_SECRET=<random-string>
PORT=3000
```

环境变量（`.env`，前端）：

```
VITE_API_URL=http://localhost:3000
```

### 8.2 开发命令

```bash
pnpm install              # 安装依赖
pnpm dev                  # 同时启动前后端
pnpm --filter backend dev  # 仅后端
pnpm --filter frontend dev # 仅前端
pnpm lint                 # ESLint
pnpm format               # Prettier
pnpm typecheck            # TypeScript 类型检查
```

### 8.3 部署（MVP 不要求，仅为参考）

- 后端：Node 进程 + PostgreSQL（Docker Compose 或云服务）
- 前端：静态构建产物（Vercel / Netlify / 静态托管）
- 前端通过 `VITE_API_URL` 指向后端

---

## 9. Key Trade-offs

### 9.1 `bucket` 显式字段 vs 纯计算

**选择**：显式字段。

**理由**：Things3 中用户显式把任务拖到 Anytime/Someday，这是用户意图。纯计算会导致：

- 修改 dueDate 时任务在视图间"跳动"
- 无法区分"用户想放 Anytime"和"任务恰好无日期"

**代价**：bucket 转换逻辑需要在 service 层维护（见 2.3 节），增加复杂度。

### 9.2 REST vs GraphQL

**选择**：REST。

**理由**：MVP 视图固定，不需要 GraphQL 的按需查询。REST 简单直接，未来多端客户端接入门槛低。

**代价**：无法一次查询获取复杂嵌套数据（如 area → projects → tasks），需要前端多次请求或后端自定义 include。

### 9.3 服务端权威 vs 离线优先

**选择**：服务端权威 + pull-based。

**理由**：离线同步（CRDT、冲突解决）复杂度极高，MVP 不值得。从单设备流畅体验开始。

**代价**：断网时无法操作。未来多端同步需要引入 WebSocket 实时推送或轮询。

### 9.4 软删除 vs 硬删除

**选择**：软删除（`status = TRASHED`）。

**理由**：废纸篓功能需要可恢复。软删除实现简单，且未来可扩展自动清理策略（30 天后永久删除）。

**代价**：查询时需要过滤 `status`，不能简单 `DELETE`。
