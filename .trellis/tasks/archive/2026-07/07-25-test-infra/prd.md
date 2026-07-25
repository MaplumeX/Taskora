# 测试基建搭建

## Goal

为 Taskora monorepo（backend / frontend / shared）建立可运行的测试基础设施，使全仓 `pnpm test` 跑通，并为后续 Tags / Logbook 功能开发提供验证安全网。

## Background

- 当前全仓 0 个测试文件，无测试运行器配置
- 后端：NestJS（已有 `Test.createTestingModule` 能力，但未安装 `@nestjs/testing`）
- 前端：React + Vite（无 Vitest 配置）
- shared 包：纯类型与枚举，可不强制测试

父任务：`07-25-gtd-enhance`

## Requirements

### 功能需求

1. **后端测试**（`packages/backend`）
   - 引入 `@nestjs/testing` + `vitest`（统一前后端测试运行器为 vitest，减少工具碎片）
   - 测试数据库策略：通过 Prisma 连接独立的测试数据库（`DATABASE_URL` 由 `TEST_DATABASE_URL` 环境变量提供），每个测试文件在 setup 时 reset 相关表（通过 `TRUNCATE` 或 transaction rollback）
   - 提供至少一个示例 Service 单测（以 `AreasService` 为例，覆盖 create / findAll / findOne / update / remove）
   - 提供至少一个示例 Controller e2e 测试（以 `AreasController` 为例，走 NestJS Testing module + supertest）
2. **前端测试**（`packages/frontend`）
   - 引入 `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom`
   - 提供至少一个示例 hook 测试（以 `useAreas` mock API 为例）
   - 提供至少一个示例组件测试（以 `TaskCheckbox` 为例）
3. **根串联**
   - 根 `package.json` 增加 `"test": "pnpm -r --parallel run test"`
   - 各包 `package.json` 增加 `"test": "vitest run"` 脚本
   - CI 暂不强制（无 `.github/workflows`，留后续）

### 技术约束

- 测试运行器统一用 `vitest`（前后端一致，配置简单，与 Vite 生态对齐）
- 不引入 Playwright / Cypress（E2E 留后续）
- 测试必须可隔离运行，不依赖手动起数据库（文档说明需先起本地 Postgres 或用 docker）
- 测试文件命名约定：`*.spec.ts`（后端）/ `*.test.tsx`（前端组件）/ `*.test.ts`（前端 hooks）

## Acceptance Criteria

- [ ] `pnpm test` 在根目录跑通，退出码 0
- [ ] `packages/backend` 至少有 AreasService 单测（≥5 个用例）+ AreasController e2e 测试（≥3 个用例）全部通过
- [ ] `packages/frontend` 至少有 useAreas hook 测试 + TaskCheckbox 组件测试全部通过
- [ ] 测试数据库通过 `TEST_DATABASE_URL` 隔离，不污染开发数据库
- [ ] 测试运行说明写入 `.trellis/spec/backend/quality-guidelines.md` 与 `.trellis/spec/frontend/quality-guidelines.md`

## Out of Scope

- Playwright / Cypress E2E
- CI / GitHub Actions 配置
- 覆盖率门槛 enforcement（仅记录覆盖率输出即可）

## Dependencies

- 无前置子任务依赖
- 下游：`tags` 和 `logbook` 依赖本任务提供测试基建来验证功能