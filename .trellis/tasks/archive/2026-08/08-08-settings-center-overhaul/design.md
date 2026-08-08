# Design — 完善设置中心与用户偏好持久化

## Architecture

### 前端路由结构

```
/settings                 → <SettingsLayout /> (左侧导航 + <Outlet />)
  /settings/appearance    → <SettingsAppearance />
  /settings/account       → <SettingsAccount /> (重构现有)
  /settings/data          → <SettingsData />
  /settings/about         → <SettingsAbout />
```

`SettingsLayout` 包含一个左侧纵向导航列表(外观 / 账户 / 数据 / 关于),用 `NavLink` 高亮当前子路由,右侧 `<Outlet />` 渲染子页面。整体 max-w 容器居中,与现有 `/settings/account` 的 max-w-lg 风格保持一致但稍宽(max-w-2xl 以容纳左侧导航)。

路由变更:`router.tsx` 中将 `/settings/account` 替换为嵌套路由:

```tsx
{
  path: '/settings',
  element: <SettingsLayout />,
  children: [
    { index: true, element: <Navigate to="/settings/appearance" replace /> },
    { path: 'appearance', element: <SettingsAppearance /> },
    { path: 'account', element: <SettingsAccount /> },
    { path: 'data', element: <SettingsData /> },
    { path: 'about', element: <SettingsAbout /> },
  ],
}
```

### 后端数据模型变更

`User` model 新增 `preferences` 字段:

```prisma
model User {
  // ...现有字段...
  preferences Json?
}
```

使用 `Json?` 类型(PostgreSQL `jsonb`),可空。空表示用户从未设置偏好(使用前端默认值)。不拆分为独立列的原因:三个偏好字段都是低频写入、整体读写,JSON 类型避免未来加字段时再做迁移。

`USER_PUBLIC_SELECT` 新增 `preferences: true`。

### API 契约

#### `GET /users/me`(修改)

`auth.controller.ts` 的 `getMe` → `auth.service.ts` 的 `getMe` 返回的 user 对象新增 `preferences` 字段。

`UserResponseDto`(shared)新增:

```typescript
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: 'zh' | 'en';
  weekStartsOn: 0 | 1;
}

export interface UserResponseDto {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  preferences: UserPreferences | null;  // 新增
  createdAt: string;
  updatedAt: string;
}
```

#### `PUT /users/me/preferences`(新增)

```typescript
// shared/dtos/user.dto.ts
export interface UpdatePreferencesDto {
  theme?: 'light' | 'dark' | 'system';
  language?: 'zh' | 'en';
  weekStartsOn?: 0 | 1;
}
```

后端 DTO 校验:

```typescript
export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';

  @IsOptional()
  @IsIn(['zh', 'en'])
  language?: 'zh' | 'en';

  @IsOptional()
  @IsIn([0, 1])
  weekStartsOn?: 0 | 1;
}
```

`UsersController` 新增:

```typescript
@Put('me/preferences')
updatePreferences(
  @Request() req: { user: { id: string } },
  @Body() dto: UpdatePreferencesDto,
) {
  return this.usersService.updatePreferences(req.user.id, dto);
}
```

`UsersService.updatePreferences`:读取现有 preferences(或空对象),合并 dto 字段,写回。返回更新后的完整 user(与 `updateProfile` 一致的 `USER_PUBLIC_SELECT`)。

```typescript
async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  if (!user) throw new NotFoundException('User not found');

  const current = (user.preferences ?? {}) as Record<string, unknown>;
  const merged = { ...current, ...dto };

  return this.prisma.user.update({
    where: { id: userId },
    data: { preferences: merged },
    select: USER_PUBLIC_SELECT,
  });
}
```

#### `DELETE /users/me`(新增)

```typescript
// shared/dtos/user.dto.ts
export interface DeleteAccountDto {
  password: string;
}
```

`UsersController` 新增:

```typescript
@Delete('me')
deleteAccount(
  @Request() req: { user: { id: string } },
  @Body() dto: DeleteAccountDto,
) {
  return this.usersService.deleteAccount(req.user.id, dto);
}
```

`UsersService.deleteAccount`:验证密码 → `prisma.user.delete`(级联清空)→ 返回 `{ ok: true }`。

```typescript
async deleteAccount(userId: string, dto: DeleteAccountDto) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw new NotFoundException('User not found');

  const ok = await bcrypt.compare(dto.password, user.passwordHash);
  if (!ok) throw new UnauthorizedException('Password incorrect');

  await this.prisma.user.delete({ where: { id: userId } });
  return { ok: true };
}
```

#### `GET /users/me/export`(新增)

`UsersController` 新增:

```typescript
@Get('me/export')
exportData(@Request() req: { user: { id: string } }) {
  return this.usersService.exportData(req.user.id);
}
```

`UsersService.exportData`:查询用户全部数据,组装为一个嵌套 JSON 对象返回。

```typescript
async exportData(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, displayName: true, avatarUrl: true,
      preferences: true, createdAt: true, updatedAt: true,
    },
  });
  if (!user) throw new NotFoundException('User not found');

  const [tasks, projects, areas, tags, tagGroups, projectHeadings] = await Promise.all([
    this.prisma.task.findMany({ where: { userId }, include: { subtasks: true, tags: true } }),
    this.prisma.project.findMany({ where: { userId }, include: { tags: true } }),
    this.prisma.area.findMany({ where: { userId }, include: { tags: true } }),
    this.prisma.tag.findMany({ where: { userId } }),
    this.prisma.tagGroup.findMany({ where: { userId } }),
    this.prisma.projectHeading.findMany({ where: { userId } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    version: '0.1.0',
    user,
    tasks,
    projects,
    areas,
    tags,
    tagGroups,
    projectHeadings,
  };
}
```

### 前端 Store 与同步层

#### 新增 `preferences.store.ts`

```typescript
type ThemeMode = 'light' | 'dark' | 'system';
type Language = 'zh' | 'en';
type WeekStartsOn = 0 | 1;

interface PreferencesState {
  weekStartsOn: WeekStartsOn;
  setWeekStartsOn: (v: WeekStartsOn) => void;
  hydrateFromServer: (prefs: UserPreferences | null) => void;
}
```

`weekStartsOn` 是新增的偏好,需要独立 store + persist(localStorage key `taskora-week-starts`)。`theme` 和 `language` 已有各自的 localStorage 存储(`theme.store.ts` / i18n),不重复存储。

`hydrateFromServer`:登录/刷新后从 `GET /users/me` 拿到 preferences,分别同步到:
- `theme.store.ts` → `setMode(prefs.theme)`
- `i18n.changeLanguage(prefs.language)`
- `preferences.store.ts` → `setWeekStartsOn(prefs.weekStartsOn)`

这个函数在 `useCurrentUser` 的 `onSuccess` 或 `main.tsx` 的 session recovery 后调用。

#### 偏好变更流程

`SettingsAppearance` 中修改偏好:

```typescript
const handleChangeTheme = (mode: ThemeMode) => {
  setMode(mode);           // 即时生效(写 localStorage + apply DOM)
  updatePreferences.mutate({ theme: mode });  // 异步同步后端
};

const handleChangeLanguage = (lng: Language) => {
  i18n.changeLanguage(lng);  // 即时生效
  updatePreferences.mutate({ language: lng });
};

const handleChangeWeekStartsOn = (v: WeekStartsOn) => {
  setWeekStartsOn(v);       // 即时生效(写 localStorage)
  updatePreferences.mutate({ weekStartsOn: v });
};
```

`updatePreferences` 失败时 toast 提示,不回滚本地状态(本地已生效,后端同步失败可稍后重试)。

#### Calendar 组件消费 weekStartsOn

`Calendar` 组件新增 `weekStartsOn` prop,透传给 `DayPicker`:

```typescript
export type CalendarProps = {
  selected?: Date;
  onSelect: (date: Date | undefined) => void;
  locale?: Locale;
  weekStartsOn?: 0 | 1;  // 新增
  autoFocus?: boolean;
  className?: string;
};
```

`ScheduledDateField` 从 `preferences.store.ts` 读取 `weekStartsOn` 传给 `Calendar`。

### 侧边栏底部齿轮按钮调整

`SidebarBottomBar.tsx` 的设置 DropdownMenu 简化:移除主题切换项和语言切换项,齿轮按钮直接 `navigate('/settings/appearance')`(不再需要 DropdownMenu,改为普通 Button)。

### 数据导出下载

前端 `GET /users/me/export` 拿到 JSON → `Blob` → `URL.createObjectURL` → 创建 `<a>` 触发下载:

```typescript
const handleExport = async () => {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `taskora-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
```

## Data Flow

```
页面加载 → GET /users/me → user.preferences
  → theme.store.setMode(theme)        [覆盖 localStorage theme]
  → i18n.changeLanguage(language)     [覆盖 localStorage lang]
  → preferences.store.setWeekStartsOn [覆盖 localStorage week-starts]

用户改偏好 → setMode / changeLanguage / setWeekStartsOn (即时生效)
  → PUT /users/me/preferences (异步同步)

用户导出 → GET /users/me/export → Blob → 下载

用户删除账户 → DELETE /users/me (含密码) → clear auth → /login
```

## Compatibility & Migration

- `User.preferences` 为 `Json?`,可空。现有用户该字段为 null,前端 `hydrateFromServer(null)` 时保持 localStorage 现有值不变(不强制覆盖为默认值)。
- 迁移文件:`prisma migrate dev --name add_user_preferences`
- `GET /users/me` 返回新增 `preferences` 字段,前端 `AuthUser` 类型同步更新。
- 现有 `PUT /users/me`(资料)和 `PUT /users/me/password`(密码)行为不变。
- 侧边栏底部齿轮按钮交互从 DropdownMenu 变为直接跳转,不影响其他功能。

## Trade-offs

| 决策 | 选择 | 理由 |
|------|------|------|
| preferences 存储类型 | `Json?` 单字段 | 三个偏好整体读写、低频写入,JSON 避免未来加字段再迁移 |
| 偏好同步 | localStorage 快速层 + 后端同步层 | 主题/语言需页面加载早期生效(避免 FOUC),localStorage 保证即时;后端保证跨端 |
| 偏好同步失败不回滚 | 是 | 本地已生效,后端失败可稍后重试,回滚会闪 |
| 不做偏好合并冲突 | 单用户单设备 | MVP 假设,并发冲突概率低;留待后续 |
| weekStartsOn 仅 0/1 | 是 | 周日/周一覆盖中英文用户习惯,不引入更细粒度 |

## Risks & Rollback

- **偏好同步竞态**:用户快速切换主题可能产生多个 `PUT` 请求,后端按到达顺序覆盖。可接受:最终一致。
- **导出大文件**:用户数据量大时 JSON 可能较大。MVP 不做分页或流式,单次返回。如需优化,后续改 stream。
- **回滚**:迁移可逆(删除 `preferences` 字段),前端路由回退到单页 `/settings/account`。偏好同步层是增量,移除后恢复纯 localStorage 行为。