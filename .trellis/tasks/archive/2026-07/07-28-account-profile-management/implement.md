# Implement — 账户自管理

执行顺序自上而下，每步跑对应校验命令。

## 1. Shared 类型

- [ ] 新建 `packages/shared/src/dtos/user.dto.ts`（`UpdateProfileDto`、`UpdatePasswordDto`、`UserResponseDto`）。
- [ ] `packages/shared/src/dtos/auth.dto.ts`：`AuthResponseDto.user` 改为 `Pick<UserResponseDto, 'id'|'email'|'displayName'|'avatarUrl'>`。
- [ ] `packages/shared/src/index.ts` 导出 user.dto。
- [ ] `pnpm --filter @taskora/shared build` 通过。

## 2. Prisma 迁移

- [ ] `schema.prisma` `User` 增加 `displayName/avatarUrl/timezone/locale`（均可空）。
- [ ] `pnpm --filter @taskora/backend prisma:migrate -- --name add_user_profile_fields`（或 `prisma migrate dev`）。
- [ ] `prisma generate`。
- [ ] 检查迁移 SQL 仅 `ALTER TABLE ADD COLUMN ... NULL`。

## 3. Backend — UsersModule

- [ ] `src/users/dto/users.dto.ts`：class-validator DTO（含 timezone 白名单校验：构造静态 `Set(Intl.supportedValuesOf('timeZone'))`）。
- [ ] `src/users/users.service.ts`：`updateProfile`、`updatePassword`、`USER_PUBLIC_SELECT` 常量。
- [ ] `src/users/users.controller.ts`：`PUT /users/me`、`PUT /users/me/password`，`@UseGuards(JwtAuthGuard)`。
- [ ] `src/users/users.module.ts`：imports PrismaModule，exports UsersService。
- [ ] `src/auth/auth.service.ts`：`getMe` 使用 `USER_PUBLIC_SELECT` 返回扩展字段。
- [ ] `src/app.module.ts`：imports UsersModule。
- [ ] `pnpm --filter @taskora/backend typecheck` 通过。
- [ ] `pnpm --filter @taskora/backend lint` 通过。

## 4. Backend — 测试

- [ ] `test/users.service.spec.ts`：updateProfile 仅更新传入字段（null 清空 vs undefined 不动）；updatePassword 旧密码错误抛 401、成功更新可用新密码登录；timezone 非法抛错。
- [ ] `pnpm --filter @taskora/backend test` 通过。
- [ ] 既存 tasks/areas/projects/tags spec 全通过。

## 5. Frontend — API & hooks

- [ ] `lib/api/users.api.ts`：`updateProfile`、`updatePassword`。
- [ ] `lib/hooks/useUsers.ts`：`useUpdateProfile`（onSuccess 更新 auth store user + invalidate `auth.me`）、`useUpdatePassword`。
- [ ] `lib/stores/auth.store.ts`：`AuthUser` 类型同步 shared。
- [ ] `pnpm --filter @taskora/frontend typecheck` 通过。

## 6. Frontend — UI

- [ ] `pages/SettingsAccount.tsx`：资料表单 + 改密表单，复用 `Input/Label/Button`，sonner toast。
- [ ] `router.tsx`：在 `AppShell` children 下加 `/settings/account`。
- [ ] `components/layout/Sidebar.tsx`：用户下拉菜单加「账户设置」项；显示名优先 `displayName ?? email`，头像优先 `avatarUrl` 否则 email 首字母。
- [ ] i18n：`auth.json` / `common.json` 新增 `settings.account`、`currentPassword`、`newPassword`、`confirmPassword`、`profileSaved`、`passwordSaved`、`passwordMismatch` 等键（zh + en）。
- [ ] `pnpm --filter @taskora/frontend lint` 通过。

## 7. 手动验收

- [ ] 注册 → 登录 → `/settings/account` 改资料保存 → Sidebar 名称更新。
- [ ] 改密码：旧密码错误 toast；正确后用新密码重新登录成功。
- [ ] 非法 timezone 提交被拒。

## Rollback Points

- 步骤 2 之后若要回滚：`prisma migrate resolve --rolled-back <migration>` 并 revert schema。
- 步骤 5/6 前端改动可独立 revert，不影响后端。
