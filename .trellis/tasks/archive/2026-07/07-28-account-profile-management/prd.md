# 账户自管理：用户资料字段与个人设置接口

## Goal

扩展 `User` 模型与对应接口，使用户能查看和修改自己的资料与密码。

Parent: `.trellis/tasks/07-28-user-system-enhancement`

## Requirements

### 数据模型

- `User` 新增字段：
  - `displayName String?`（可空，展示名）
  - `avatarUrl String?`（可空，头像 URL）
  - `timezone String?`（可空，IANA 时区，如 `Asia/Shanghai`）
  - `locale String?`（可空，如 `zh` / `en`）
- 迁移可逆，已有用户默认 NULL。

### 接口

- `GET /auth/me` 返回扩展字段：`{ id, email, displayName, avatarUrl, timezone, locale, createdAt, updatedAt }`。
- 新增 `PUT /users/me`（受 JWT 保护）：
  - 入参：`displayName?`、`avatarUrl?`、`timezone?`、`locale?`（全是可选，全量更新语义）。
  - `timezone` 若提供需是有效 IANA 时区（用 `Intl.supportedValuesOf('timeZone')` 等价校验；后端用白名单或正则约束）。
  - `locale` 若提供需在 `['zh','en']` 内。
  - `avatarUrl` 若提供需是 https URL（或相对路径，按需定）。
- 新增 `PUT /auth/password`（受 JWT 保护）：
  - 入参：`currentPassword`、`newPassword`。
  - 校验 `currentPassword` 与库中 `passwordHash` 一致，否则 `UnauthorizedException`。
  - `newPassword` 沿用 `MinLength(8)`。
  - 成功后哈希新密码并更新；不返回任何敏感字段（返回 `{ ok: true }` 或 204）。
  - 不触发其他 session 失效（本期范围外）。

### 前端

- Sidebar 用户菜单增加「账户设置」入口，路由 `/settings/account`。
- 新建 `SettingsAccount` 页面：
  - 资料表单：displayName / avatarUrl / timezone / locale（下拉）。
  - 修改密码表单：currentPassword / newPassword / confirmPassword。
  - 使用 react-query mutation + sonner toast。
  - 保存成功后更新本地 auth store 中的 user 快照。
- `AuthUser` 类型（shared）同步扩展。

## Acceptance Criteria

- [ ] Prisma 迁移生成且可执行、可回滚；本地 `prisma migrate dev` 通过。
- [ ] `GET /auth/me` 返回扩展字段。
- [ ] `PUT /users/me` 能更新资料；非法 timezone / locale / avatarUrl 被拒绝（422/400）。
- [ ] `PUT /auth/password`：旧密码错误返回 401；成功返回成功态且新密码可用于登录。
- [ ] 前端 `/settings/account` 页面可查看、修改资料与密码；保存成功后 Sidebar 显示名同步更新。
- [ ] 新增接口有单测；现有测试全部通过。

## Out of Scope

- Refresh Token 流程（子任务 B）。
- 注销账号、邮箱验证、头像上传（仅 URL）。

## Dependencies

- 无前置依赖；可在子任务 B 之前独立完成。
- 子任务 B 的 cookie 流程不影响本任务的接口契约。
