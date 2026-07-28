# 用户系统完善：账户自管理 + Refresh Token

## Background

当前用户系统仅有 `email + passwordHash`，认证采用单一 access token（7d 有效期，存 localStorage），缺少：

1. 账户自管理能力：无用户资料字段、无改资料/改密码接口。
2. Refresh Token 机制：access token 泄露后无法吊销，过期后前端在 401 拦截器里直接清状态并跳登录，用户会突然丢失上下文。

## Goal

在不破坏现有功能的前提下，补齐账户自管理能力并引入 HttpOnly Cookie + 轮换的 Refresh Token 机制。

## Scope

### 子任务 A — 账户自管理（`07-28-account-profile-management`）

- 扩展 `User` 模型字段：`displayName`、`avatarUrl`、`timezone`、`locale`。
- `GET /auth/me` 返回扩展后的用户资料。
- 新增 `PUT /users/me`：修改 displayName / avatarUrl / timezone / locale。
- 新增 `PUT /auth/password`：修改密码，需校验旧密码。
- 前端 Sidebar 用户菜单增加「账户设置」入口与表单页。

### 子任务 B — Refresh Token（`07-28-refresh-token-mechanism`）

- 引入 refresh token（随机字符串，哈希入库，带过期与吊销）。
- `/auth/login` 与 `/auth/register` 成功后：access token 走响应体，refresh token 走 HttpOnly Cookie。
- 新增 `POST /auth/refresh`：校验 cookie 中的 RT，签发新 access token；**做轮换 + reuse detection**（RT 一次性，命中已使用过的 RT 即吊销整个 token family）。
- 新增 `POST /auth/logout`：吊销当前 RT（清 cookie + 标记 DB 失效）。
- 前端：access token 放内存（不持久化），页面刷新时通过 `/auth/refresh` 静默换取新 access token；RT 走 cookie，需配套 CSRF 防护（SameSite=Lax + 双提交或自定义头）。
- 前端 401 拦截器改为：触发一次 `/auth/refresh`，成功则重放原请求，失败才清状态跳登录。

## Out of Scope

- 注销账号（DELETE /users/me）—— 本期不做。
- 邮箱验证、忘记密码、第三方 OAuth。
- 限流、CORS 白名单、JWT 密钥硬编码回退等问题 —— 由后续安全加固任务处理。

## Cross-Child Acceptance Criteria

- [ ] 子任务 A 与 B 独立可验收，不互相阻塞代码合入；但集成时两者必须共存且功能正常。
- [ ] 两个子任务共用同一套 `User` 模型迁移（B 的 RT 字段与 A 的资料字段可在同一迁移或相邻迁移中落地，不冲突）。
- [ ] 现有用例无回归：注册 → 登录 → 访问受保护路由 → 登出，全流程通过。
- [ ] 两个子任务各自旧有测试通过；新增功能有对应单测/e2e。

## Task Map

| 子任务 | 目录 | 可独立交付 |
| --- | --- | --- |
| A — 账户自管理 | `.trellis/tasks/07-28-account-profile-management` | 是 |
| B — Refresh Token | `.trellis/tasks/07-28-refresh-token-mechanism` | 是（但依赖 A 的用户资料返回结构稳定） |

## Execution Order

建议先 A 后 B：A 先稳定 `User` 模型与 `/auth/me` 返回结构，B 在其上引入 RT 表与 cookie 流程。若并行，则在 B 的 `implement.md` 中注明对 A 输出的依赖契约。

## Notes

- 父任务不直接实施代码；完成两个子任务后由父任务做集成评审并归档。
- 密码强度本期维持现有 `MinLength(8)`，复杂度策略交由后续安全加固任务。
