# Design — 账户自管理

## 架构

延续现有分层：Controller → Service → PrismaService。不新建模块；在 `auth` 模块内扩展，新建一个轻量 `users` 子模块以放置 `PUT /users/me`、`PUT /auth/password` 中与用户实体直接相关的操作。

> 选择新建 `UsersModule` 而非堆到 `AuthModule`：auth 关注认证（签发/校验 token），users 关注账户实体读写；分离便于后续扩展（头像上传、注销账号等）。

## 数据模型

`prisma/schema.prisma` `User` 新增：

```prisma
model User {
  // ...existing...
  displayName String?
  avatarUrl   String?
  timezone    String?
  locale      String?
}
```

迁移名：`<timestamp>_add_user_profile_fields`。

## DTO（shared + backend）

### shared `packages/shared/src/dtos/user.dto.ts`（新建）

```ts
export interface UpdateProfileDto {
  displayName?: string | null;
  avatarUrl?: string | null;
  timezone?: string | null;
  locale?: string | null;
}

export interface UpdatePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface UserResponseDto {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  locale: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- `AuthResponseDto.user` 更新为引用 `Pick<UserResponseDto, 'id'|'email'|'displayName'|'avatarUrl'>`（登录返回精简体即可）。
- `auth.store.ts` 的 `AuthUser` 同步。

### backend DTO `packages/backend/src/users/dto/users.dto.ts`（新建）

用 class-validator：

- `UpdateProfileDto`：
  - `displayName?` `IsOptional IsString MaxLength(64)`
  - `avatarUrl?` `IsOptional IsURL({ require_protocol: true, protocols: ['https'] })` 允许 null（`@ValidateIf((o)=>o.avatarUrl!=null)`）
  - `timezone?` `IsOptional IsString` + 自定义校验：在 `Intl.supportedValuesOf` 等价集合内；Node 20+ 支持，或用 `Intl.availableCanonical` ？ 后端用 `Intl.supportedValuesOf('timeZone')` 缓存为 Set。
  - `locale?` `IsOptional IsIn(['zh','en'])`
- `UpdatePasswordDto`：
  - `currentPassword` `IsString MinLength(8)`
  - `newPassword` `IsString MinLength(8) MaxLength(128)`

## 模块/控制器/服务

```
src/users/
  users.module.ts
  users.controller.ts
  users.service.ts
  dto/users.dto.ts
```

- `UsersModule` imports `PrismaModule`，exports `UsersService`。
- `UsersController` (`@Controller('users')`，`@UseGuards(JwtAuthGuard)`)：
  - `PUT /users/me` → `UsersService.updateProfile(userId, dto)`
  - `PUT /users/me/password` → `UsersService.updatePassword(userId, dto)`
    - 选 `/users/me/password` 而非 `/auth/password`：语义更清晰（账户实体下的操作）。`prd.md` 提到的 `/auth/password` 等价于此。
- `AuthService.getMe` 改为返回扩展字段；或 `AuthModule` 注入 `UsersService` 反向调用 —— **选择前者**：`AuthService` 直接查 prisma 并选扩展字段，避免循环依赖。
- `AppModule` imports `UsersModule`。

## Service 行为

```ts
// users.service.ts
async updateProfile(userId, dto) {
  // 仅更新传入字段；prisma update with data only contains defined keys
  // null 表示显式清空 → 需区分 undefined（不动）与 null（清空）
  const data: Prisma.UserUpdateInput = {};
  if (dto.displayName !== undefined) data.displayName = dto.displayName;
  if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
  if (dto.timezone !== undefined) data.timezone = dto.timezone;
  if (dto.locale !== undefined) data.locale = dto.locale;
  return this.prisma.user.update({ where: { id: userId }, data, select: USER_PUBLIC_SELECT });
}

async updatePassword(userId, dto) {
  const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw new NotFoundException();
  const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
  if (!ok) throw new UnauthorizedException('Current password incorrect');
  const hash = await bcrypt.hash(dto.newPassword, 10);
  await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
  return { ok: true };
}
```

`USER_PUBLIC_SELECT` 常量集中在 `users.service.ts` 或 `prisma.service.ts` 导出，供 `AuthService.getMe` 复用。

## 前端

- 路由：`/settings/account`（在 `ProtectedRoute` 内、`AppShell` 子路由下）。
- Sidebar 用户下拉菜单加一项「账户设置」→ navigate。
- 新建 `pages/SettingsAccount.tsx`，两个表单：
  - ProfileForm（react-hook-form 或受控；与现有 Login 页风格一致，复用 `Input`/`Label`/`Button`）。
  - PasswordForm。
- 新建 `lib/api/users.api.ts`：`updateProfile`、`updatePassword`。
- `lib/hooks/useUsers.ts`：`useUpdateProfile`、`useUpdatePassword` mutation；`updateProfile` 成功后更新 `auth.store` 的 `user` 快照与 react-query `auth.me` 缓存。
- `AuthUser` 类型扩展后 Sidebar 显示 `displayName ?? email`。

## 风险/权衡

- 时区白名单：Node 20+ `Intl.supportedValuesOf('timeZone')` 可用；若部署环境不支持需 fallback 到 TZ 数据包。当前后端用 Node 22（见根 env），可用。
- `null` vs `undefined` 语义：DTO 用 `@ValidateIf` 处理 null；shared 类型用 `| null`。
- 不触发其他 session 失效：本期明确不做。

## 回滚

- 迁移可降级（`prisma migrate resolve --rolled-back` 或 `migrate down` 语义）；字段为可空，降级安全。
- 前端路由新增不影响旧路径。
