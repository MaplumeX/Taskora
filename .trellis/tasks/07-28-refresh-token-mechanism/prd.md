# Refresh Token 机制：HttpOnly Cookie + 轮换

## Goal

引入安全的 Refresh Token 流程：access token 短期、放内存；refresh token 走 HttpOnly Cookie，一次性轮换并做 reuse detection。

Parent: `.trellis/tasks/07-28-user-system-enhancement`

## Requirements

### 数据模型

- 新增 `RefreshToken` 表：
  - `id`、`userId`、`tokenHash`（.sha-256 哈希）、`familyId`（token family 标识）、`expiresAt`、`revokedAt`（可空）、`createdAt`。
  - 索引：`userId`、`tokenHash`（unique）、`familyId`。
- `User` 不新增字段。

### 接口

- `POST /auth/login`：成功后返回 `{ accessToken, user }`；同时 `Set-Cookie: rt=<random>; HttpOnly; Secure=...(prod); SameSite=Lax; Path=/auth; MaxAge=...`。RT 哈希入库，标记 `familyId`。
- `POST /auth/register`：注册成功后视同登录（返回 access token + RT cookie）。**注意**：决策点 —— 注册后是否自动登录。当前 `useRegister` 跳 `/login` 让用户手动登录。**保持现状**：注册不返回 token，用户手动登录；减少改动面。
- `POST /auth/refresh`（公开路由，不需 access token）：
  - 读 cookie 中的 RT，哈希后查库。
  - 不存在 / 已 revoke / 已过期 → 401 + 清 cookie。
  - 命中有效 RT → 签发新 access token，**当次 RT 标记 revoked**，写入新 RT（同 familyId）到 cookie。返回 `{ accessToken, user }`。
  - **reuse detection**：若收到的 RT 已被 revoke（说明被截获后重放），吊销整个 `familyId` 下所有 RT，返回 401 + 清 cookie。
- `POST /auth/logout`（需 access token）：
  - 读 cookie RT，标记 revoked，清 cookie。
  - 无 cookie 也返回成功（幂等）。
- `GET /auth/me` 维持现状（需 access token）。

### Access Token

- 有效期从 7d 缩短到 `15m`。
- 仍用现有 `JwtModule` 签发。

### 前端

- `auth.store`：`token` 不再 persist（`partialize` 仅 persist `user` 快照用于首屏渲染），access token 放内存。
- 新增 `lib/api/auth.api.ts` `refresh()` 调用 `/auth/refresh`。
- 应用启动时（`AppShell` 或顶层）：若有 `user` 快照但无 token，调用 `/auth/refresh` 获取 access token；失败则跳 `/login`。
- `client.ts` axios 拦截器改造：
  - 401 时调用 `refresh()` 一次，成功则重放原请求；失败则 `clear()` 跳 `/login`。
  - 用「正在刷新」锁，避免并发 401 触发多次刷新。
- `useLogin`：`onSuccess` 存储 access token 到内存，RT 自动由浏览器存 cookie。
- `useLogout`：调用 `POST /auth/logout` 后清 store + 跳登录。
- CSRF：RT cookie 走 `SameSite=Lax`，对 `POST /auth/refresh` 与 `/auth/logout` 要求请求体为空且校验 `Origin` / `Sec-Fetch-Site`（或自定义 header `X-Requested-With: axios`）。

## Acceptance Criteria

- [ ] `RefreshToken` 迁移生成可执行。
- [ ] `/auth/refresh` 轮换：同一 RT 二次使用触发 reuse detection，吊销整个 family。
- [ ] 正常流程：登录 → access token 过期 → 前端自动刷新 → 继续操作无感。
- [ ] `/auth/logout` 吊销当前 RT；之后再 `/auth/refresh` 该 RT 返回 401。
- [ ] access token 不在 localStorage 持久化；刷新页面后若 RT 有效则静默恢复，否则跳登录。
- [ ] 新增单测覆盖：refresh 服务（正常/过期/reuse detection）、logout。
- [ ] 现有流程无回归：注册 → 登录 → 访问受保护资源 → 登出。

## Out of Scope

- access token 黑名单 / 主动吊销 access token（access 仍是无状态短令）。
- 修改密码后吊销其他 session（子任务 A 范围外，联动留待后续）。
- 多设备 session 管理界面。

## Dependencies

- 建议在子任务 A 之后实施（共用 `User` 模型迁移历史，且 `/auth/me` 返回结构先稳定）。
- 不强依赖 A 的资料字段；可并行，但集成前 A 必须合入。
