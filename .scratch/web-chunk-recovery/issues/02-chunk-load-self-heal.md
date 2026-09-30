# 02: 前端 chunk 加载失败自愈

Status: done

## 内容

新增 `packages/frontend/src/lib/chunkRecovery.ts`：

- `reloadOnceForNewBuild()`：用 `sessionStorage` 的 `taskora:chunk-reload-at` 存上次自愈刷新的时间戳，冷却 10s 内不重复刷新，返回是否已发起刷新。`sessionStorage` 不可用（隐私模式）时安全降级为 `false`。
- 用**时间戳 + 冷却**而非「每会话一次」的布尔位：布尔位只能在别处加载成功时清除，若真有一个 chunk 永久 404，就会「A 成功清标记 → B 失败刷新 → 刷新后 A 又成功 …」无限循环；时间戳不被成功加载重置，冷却期内再失败直接抛错。
- `installChunkLoadRecovery()`：拦截 `vite:preloadError`（modulepreload 失败），`preventDefault()` 后走自愈；幂等。
- `__setReloadForTest()`：测试注入点，因为 jsdom 的 `Location` 不可打桩。

新增 `packages/frontend/src/lib/lazyWithRetry.ts`：

- `loadWithRecovery(factory)`：失败时若能刷新（不在冷却期内）则返回一个永不 settle 的 Promise（页面停在 Suspense fallback 直到重载），否则抛出原错误。
- `lazyWithRetry(factory)`：`React.lazy` 的替代。

接入：

- `packages/frontend/src/router.tsx`：16 个路由级 `lazy()` 全量换成 `lazyWithRetry()`。
- `packages/frontend/src/main.tsx`：渲染前调用 `installChunkLoadRecovery()`。

## 验收标准

- [x] `chunkRecovery.test.ts`：首次刷新并写时间戳 / 冷却期内不刷 / 冷却过后可再刷 / `sessionStorage` 异常降级 / `vite:preloadError` 被拦截且 `defaultPrevented`
- [x] `lazyWithRetry.test.ts`：成功透传模块 / 首次失败发起刷新且 Promise 不 settle / 冷却期内失败抛出原错误
- [x] `pnpm --filter @taskora/frontend test`、`typecheck`、`build` 通过
- [ ] 生产环境跨版本导航回归（需发布后验证）

## Comments

- 2026-09-30：实现。事故现场旧 chunk `Inbox-CBbab-ky.js` 已 404，当前构建引用 `Inbox-DfLCM8tt.js`。初版用「每会话一次」布尔守卫，复查时发现「其它 chunk 成功加载会清掉标记」会导致永久 404 情形下的刷新循环，改为时间戳冷却。
