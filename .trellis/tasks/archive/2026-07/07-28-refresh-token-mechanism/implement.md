# Implement — Refresh Token 机制

## 1. Prisma 迁移

- [ ] `schema.prisma`：
  - 新增 `RefreshToken` 模型（字段、索引如 design）。
  - `User` 加 `refreshTokens RefreshToken[]` 反向关系。
- [ ] `pnpm --filter @taskora/backend prisma:migrate -- --name add_refresh_tokens`。
- [ ] `prisma generate`。
- [ ] 检查生成的 SQL：`CREATE TABLE "RefreshToken"` + 索引。

## 2. Backend — helpers & service

- [ ] `src/auth/refresh-token.helpers.ts`：`generateRt()`（`crypto.randomBytes(32).toString('base64url')`）、`hashRt(t)`（sha-256 hex）、`RT_COOKIE_NAME='rt'`、`RT_TTL_MS`、`COOKIE_OPTS`（按 NODE_ENV 切 Secure）。
- [ ] `src/auth/auth.service.ts`：
  - `login` 改为返回 `{ accessToken, user, rt }`（或抽 `issueTokens(userId)` 辅助）；实际 controller 负责写 cookie。
  - `issueRefreshToken(userId, familyId?)`：生成 + 入库 + 返回明文 RT。
  - `rotateRefreshToken(incomingRt)`：含 reuse detection 与事务。
  - `revokeRefreshToken(rt)`：登出用。
  - access token expiresIn 改 `15m`。
- [ ] JWT 配置 `signOptions.expiresIn = '15m'`。
- [ ] `pnpm --filter @taskora/backend typecheck` 通过。

## 3. Backend — controller

- [ ] `src/auth/auth.controller.ts`：
  - `POST /auth/login`：调 `issueTokens`，`res.cookie('rt', rt, COOKIE_OPTS)`，返回 `{ accessToken, user }`。
  - `POST /auth/refresh`：公开路由（不加 `JwtAuthGuard`）。读 `req.cookies['rt']`，调 `rotateRefreshToken`；成功写新 cookie 返回 `{ accessToken, user }`；失败 `res.clearCookie` + 401。校验 `Sec-Fetch-Site`（非 `cross-site`，missing 放行）。
  - `POST /auth/logout`：加 `JwtAuthGuard`。调 `revokeRefreshToken`，`res.clearCookie`，返回 `{ ok: true }`。
  - `register` 维持现状（不签发 token）。
  - `getMe` 不变。
- [ ] 注入 `@Res({ passthrough: true }) Response` 以写 cookie 同时让 Nest 序列化返回体。

## 4. Backend — 测试

- [ ] `test/auth.service.spec.ts`（新建）：
  - `issueRefreshToken` 入库 hash 正确。
  - `rotateRefreshToken`：有效 RT → 返回新 access + 新 RT hash 入库；旧 RT 标记 revoked。
  - reuse detection：复用已 revoked 的 RT → 抛 401 + 同 family 全部 revoked=true。
  - 过期 RT → 抛 401。
- [ ] `pnpm --filter @taskora/backend test` 通过。
- [ ] 已有 spec 全通过。

## 5. Frontend — store & api

- [ ] `auth.store.ts`：
  - `partialize` 改为仅 persist `user`（不 persist token）。
  - 新增 `setToken(t)`、`refreshing: boolean`、`setRefreshing`。
- [ ] `lib/api/auth.api.ts`：新增 `refresh(): Promise<{ accessToken; user }>`（`withCredentials: true` 已在 client）。
- [ ] `lib/api/client.ts`：确保 `withCredentials: true`。

## 6. Frontend — client 401 拦截器

- [ ] 改造 `client.ts` response 拦截器：单飞锁 + 等待队列 + 重放原请求；refresh 自身 401 → clear + reject。
- [ ] `pnpm --filter @taskora/frontend typecheck` 通过。

## 7. Frontend — 启动恢复 & 路由

- [ ] `main.tsx` 或 `App`：启动时若有 `user` 快照但无 token，触发 `refresh()`；成功 setAuth，失败 clear。
- [ ] `ProtectedRoute`：token 存在放行；否则若 `refreshing` → 挂起（null/skeleton）；否则 redirect `/login`。

## 8. Frontend — useLogin / useLogout

- [ ] `useLogout`：改为先 `POST /auth/logout`（容忍失败），再 `clear + queryClient.clear + navigate('/login')`。
- [ ] `useLogin` 保持 `setAuth(accessToken, user)`；RT 自动 cookie。

## 9. i18n

- [ ] `auth.json`（zh/en）确认已有 `sessionExpired`、`loginFailed` 文案；按需新增。
- [ ] `pnpm --filter @taskora/frontend lint` 通过。

## 10. 手动验收

- [ ] 登录 → access token 过期（手动改短或等）→ 下一个请求自动 refresh，无感继续。
- [ ] 复用旧 RT 二次刷新 → 触发 reuse detection，整个 family 失效，跳登录。
- [ ] 刷新页面（RT 有效）静默恢复；RT 失效跳登录。
- [ ] `POST /auth/logout` 后再次 `/auth/refresh` 该 RT 返回 401。
- [ ] 跨站 POST 无法刷新（Sec-Fetch-Site=cross-site 被拒）。

## Rollback Points

- 步骤 1 迁移可降级：`prisma migrate resolve --rolled-back <name>` + revert schema + drop table。
- 步骤 5/6 store 与拦截器改动可独立 revert 到旧 localStorage 方案。
