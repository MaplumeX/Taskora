# 测试基建 — 执行计划

## 执行顺序

每个步骤需通过对应验证命令后才进入下一步。

### Step 1: 安装依赖

- [ ] `packages/backend` 添加 devDependencies：`vitest @nestjs/testing supertest @types/supertest`
- [ ] `packages/frontend` 添加 devDependencies：`vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`
- [ ] 根 `package.json` 添加 `"test": "pnpm -r --parallel run test"`
- [ ] 各包 `package.json` 添加 `"test": "vitest run"` 脚本
- [ ] 后端 `package.json` 添加 `"pretest": "pnpm --filter @taskora/shared build && prisma generate"`

**验证**：`pnpm install` 成功，`pnpm -r run test` 命令可识别（即使无测试文件也不应报脚本缺失）

### Step 2: 后端 vitest 配置 + 测试 DB 工具

- [ ] 创建 `packages/backend/vitest.config.ts`（见 design §3.1）
- [ ] 创建 `packages/backend/test/db.ts`：
  - 导出 `testPrisma`（独立 PrismaClient 实例，连 `TEST_DATABASE_URL`）
  - 导出 `resetDb()`（TRUNCATE 所有业务表，按依赖顺序：Task → Project → Area → User）
  - 若 `TEST_DATABASE_URL` 未设置，env-guard 报错提示
- [ ] 创建 `packages/backend/test/jest.setup.ts`（如需全局 setup）

**验证**：`npx vitest run --config vitest.config.ts` 配置被识别（无测试文件可跳过）

### Step 3: 后端示例 Service 单测

- [ ] 创建 `packages/backend/test/areas.service.spec.ts`
  - mock PrismaService
  - 覆盖 `create / findAll / findOne / update / remove`（含 NotFoundException 场景）
  - ≥5 个用例

**验证**：`pnpm --filter @taskora/backend test` 通过，areas.service.spec.ts 全 green

### Step 4: 后端示例 Controller e2e 测试

- [ ] 创建 `packages/backend/test/areas.controller.e2e-spec.ts`
  - 用 `Test.createTestingModule` 构建完整 module（真实 PrismaService + AreasController + AreasService）
  - 每个测试 `beforeEach` 调 `resetDb()`
  - 创建测试 User 并生成 JWT，走 supertest 带 Authorization header
  - 覆盖 `POST /areas`（201）+ `GET /areas`（200）+ `GET /areas/:id` 404（≥3 个用例）

**验证**：需先设置 `TEST_DATABASE_URL`，e2e 测试全 green

### Step 5: 前端 vitest 配置 + setup

- [ ] 创建 `packages/frontend/vitest.config.ts`（见 design §3.2）
- [ ] 创建 `packages/frontend/src/test/setup.ts`：注册 `@testing-library/jest-dom`（`import '@testing-library/jest-dom/vitest'`）

**验证**：`npx vitest run --config vitest.config.ts` 配置被识别

### Step 6: 前端示例 hook 测试

- [ ] 创建 `packages/frontend/src/lib/hooks/useAreas.test.ts`
  - mock `vi.mock('@/lib/api/areas.api')` 返回固定数据
  - 用 `renderHook` 测试 `useAreasQuery` 返回 data
  - 测试 `useCreateArea` mutation 调用后 invalidates query

**验证**：`pnpm --filter @taskora/frontend test` 通过

### Step 7: 前端示例组件测试

- [ ] 创建 `packages/frontend/src/components/task/TaskCheckbox.test.tsx`
  - mock QueryClientProvider 包裹
  - 测试未完成状态显示空圆圈
  - 测试点击触发 `useCompleteTask` mutation

**验证**：前端测试全 green

### Step 8: 全仓串联 + spec 更新

- [ ] 在根目录跑 `pnpm test` 确认所有包测试通过
- [ ] 更新 `.trellis/spec/backend/quality-guidelines.md`：记录测试约定（vitest、测试 DB 隔离、文件命名）
- [ ] 更新 `.trellis/spec/frontend/quality-guidelines.md`：记录测试约定（vitest、jsdom、Testing Library）

**验证**：`pnpm test` 退出码 0，spec 文件已更新

## Validation Commands

```bash
# 安装
pnpm install

# 后端测试（需 TEST_DATABASE_URL）
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/taskora_test" \
  pnpm --filter @taskora/backend test

# 前端测试
pnpm --filter @taskora/frontend test

# 全仓
pnpm test
```

## Review Gates

- Step 3 后：review Service 单测是否真正 mock 了 PrismaService（不是连真实 DB）
- Step 4 后：review e2e 测试是否真正走 HTTP 管道（不是直接调 service）
- Step 8 后：review spec 文档是否准确反映实际约定

## Rollback Points

- Step 2 后若发现问题：删除 `vitest.config.ts` + `test/` 目录即可回滚，不影响生产
- Step 1 后：devDependencies 可保留，不污染运行时