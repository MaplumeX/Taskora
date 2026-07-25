# 测试基建 — 技术设计

## 1. 架构决策

### 1.1 统一测试运行器：Vitest

前后端统一用 vitest，理由：
- 前端是 Vite 项目，vitest 原生集成
- 后端 NestJS 虽官方推荐 Jest，但 vitest 兼容 Jest API（`describe/it/expect/beforeEach`），且配置更轻
- 减少工具碎片：一套配置思路、一份 `@types` 依赖

### 1.2 测试数据库隔离策略

采用 **独立测试数据库 + per-file TRUNCATE** 方案，而非 transaction rollback（Prisma 对 transaction-per-test 支持复杂，且 Prisma Client 会缓存连接）：

- `TEST_DATABASE_URL` 环境变量指向独立 Postgres 实例/数据库
- 提供全局 setup 工具 `packages/backend/test/db.ts`：导出 `resetDb()` 函数，执行 `TRUNCATE` 所有业务表
- 每个 Service 测试文件在 `beforeEach` 调用 `resetDb()`
- 不用 testcontainers（需 Docker，增加本地跑测试门槛）；文档说明需本地 Postgres 或 `docker run postgres`

**决策依据**：MVP 阶段团队规模小，独立测试数据库 + TRUNCATE 是最简方案，Prisma 官方文档也推荐此模式。transaction rollback 在 Prisma 中需用 interactive transactions 且与 NestJS 依赖注入不兼容。

### 1.3 NestJS Testing 集成

后端用 `@nestjs/testing` 的 `Test.createTestingModule` 构建测试模块：
- Service 单测：mock PrismaService（用 vitest mock），不依赖真实数据库 → 快速、隔离
- Controller e2e：用真实 PrismaService + 测试数据库，走 supertest HTTP 请求 → 验证完整管道（ValidationPipe、Guard、路由）

两层互补：Service 单测覆盖业务逻辑，Controller e2e 覆盖 HTTP 层契约。

## 2. 数据流与边界

### 2.1 后端测试结构

```
packages/backend/
├── test/
│   ├── db.ts                    # resetDb() + testPrisma client
│   ├── areas.service.spec.ts    # Service 单测（mock PrismaService）
│   └── areas.controller.e2e-spec.ts  # Controller e2e（真实 DB + supertest）
├── vitest.config.ts             # 后端 vitest 配置
└── src/
```

### 2.2 前端测试结构

```
packages/frontend/
├── src/
│   ├── lib/hooks/
│   │   └── useAreas.test.ts     # hook 测试（mock apiClient）
│   └── components/task/
│       └── TaskCheckbox.test.tsx # 组件测试
├── vitest.config.ts
└── src/test/setup.ts            # jest-dom 全局注册
```

## 3. 关键契约

### 3.1 vitest.config.ts（后端）

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    setupFiles: [],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

### 3.2 vitest.config.ts（前端）

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

### 3.3 PrismaService 测试覆盖

后端 Service 单测用 `vi.mock('../prisma/prisma.service')` 或直接注入 mock 对象：

```ts
const mockPrisma = {
  area: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};
```

Controller e2e 用真实 PrismaService（连测试 DB），通过 module override 注入。

## 4. 依赖新增

### packages/backend/devDependencies
- `vitest`
- `@nestjs/testing`
- `supertest` + `@types/supertest`

### packages/frontend/devDependencies
- `vitest`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`
- `jsdom`

### 根 devDependencies
- `vitest`（workspace hoist）

## 5. 兼容性与回滚

- 不改动任何现有生产代码逻辑（只新增测试文件 + 配置 + package.json 脚本）
- 引入 `@nestjs/testing` 不影响 NestJS 运行时
- vitest 配置独立于 nest start / vite build，不影响 `pnpm dev` / `pnpm build`
- 回滚：删除 `test/` 目录、`vitest.config.ts`、移除 devDependencies、还原 package.json scripts

## 6. 风险

- **测试数据库需手动准备**：文档需明确说明 `TEST_DATABASE_URL` 如何配置（本地 Postgres 或 docker），否则 CI/团队协作会卡住
- **Prisma Client 生成路径**：e2e 测试需 `prisma generate` 已执行，测试脚本前置 `prisma:generate`
- **shared 包 build 前置**：后端测试 import `@taskora/shared`，需 shared 已 build（root `predev` 已处理 dev，test 脚本需补 `pretest`）