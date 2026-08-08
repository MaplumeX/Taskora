# Implement — 完善设置中心与用户偏好持久化

## Implementation Checklist

按以下顺序执行,每步完成后运行对应验证命令。

### Phase A:后端 — 数据模型与 API

#### A1. Prisma schema 加 preferences 字段

- [ ] `packages/backend/prisma/schema.prisma` `User` model 新增 `preferences Json?`
- [ ] `USER_PUBLIC_SELECT`(`users.service.ts`)新增 `preferences: true`
- [ ] `pnpm --filter @taskora/backend exec prisma migrate dev --name add_user_preferences`
- [ ] 验证:迁移文件生成,`prisma generate` 成功

#### A2. shared DTO 新增

- [ ] `packages/shared/src/dtos/user.dto.ts` 新增:
  - `UserPreferences` interface(`theme` / `language` / `weekStartsOn`)
  - `UpdatePreferencesDto` interface(三个字段均 optional)
  - `DeleteAccountDto` interface(`password: string`)
  - `UserResponseDto` 新增 `preferences: UserPreferences | null` 字段
- [ ] `pnpm --filter @taskora/shared build`(刷新 dist)
- [ ] 验证:`pnpm typecheck` 通过

#### A3. 后端 DTO + Service + Controller

- [ ] `packages/backend/src/users/dto/users.dto.ts` 新增 `UpdatePreferencesDto`、`DeleteAccountDto`(class-validator 装饰器)
- [ ] `UsersService` 新增:
  - `updatePreferences(userId, dto)`:读现有 preferences → 合并 → 写回 → 返回 USER_PUBLIC_SELECT
  - `deleteAccount(userId, dto)`:bcrypt 验证密码 → `prisma.user.delete({ where: { id: userId } })` → 返回 `{ ok: true }`
  - `exportData(userId)`:Promise.all 查全部数据(user/tasks/projects/areas/tags/tagGroups/projectHeadings,include 关联)→ 组装嵌套 JSON 返回
- [ ] `UsersController` 新增:
  - `@Put('me/preferences')` → `updatePreferences`
  - `@Delete('me')` → `deleteAccount`
  - `@Get('me/export')` → `exportData`
- [ ] 验证:`pnpm --filter @taskora/backend run typecheck` 通过

#### A4. 后端测试

- [ ] `packages/backend/test/users.service.spec.ts` 新增:
  - `updatePreferences`:合并字段、null preferences 起步、返回完整 user
  - `deleteAccount`:密码正确→delete 调用+返回 ok;密码错误→UnauthorizedException;用户不存在→NotFoundException
  - `exportData`:返回完整嵌套结构
- [ ] 验证:`pnpm --filter @taskora/backend test` 通过

### Phase B:前端 — 偏好同步层

#### B1. preferences store

- [ ] `packages/frontend/src/lib/stores/preferences.store.ts`:Zustand + persist,localStorage key `taskora-week-starts`,state `weekStartsOn: 0 | 1`,action `setWeekStartsOn`、`hydrateFromServer(prefs)`
- [ ] 验证:`pnpm --filter @taskora/frontend run typecheck` 通过

#### B2. API + hooks

- [ ] `packages/frontend/src/lib/api/users.api.ts` 新增:
  - `updatePreferences(data: UpdatePreferencesDto): Promise<UserResponseDto>`
  - `deleteAccount(data: DeleteAccountDto): Promise<{ ok: boolean }>`
  - `exportData(): Promise<ExportDataResponse>`
- [ ] `packages/frontend/src/lib/hooks/useUsers.ts` 新增:
  - `useUpdatePreferences()`(mutation,onSuccess invalidate authKeys.me)
  - `useDeleteAccount()`(mutation)
  - `useExportData()`(mutation 或直接 async 函数)

#### B3. AuthUser 类型 + 偏好 hydrate

- [ ] `auth.store.ts` 的 `AuthUser` 类型同步新增 `preferences` 字段(因 `UserResponseDto` 新增了 preferences)
- [ ] 在 `useCurrentUser` query 的 `onSuccess`(或 main.tsx session recovery 后)调用 `hydrateFromServer(user.preferences)`:
  - `user.preferences` 非 null → `theme.store.setMode(prefs.theme)`、`i18n.changeLanguage(prefs.language)`、`preferences.store.setWeekStartsOn(prefs.weekStartsOn)`
  - `user.preferences` 为 null → 不覆盖 localStorage(保持现有值)

### Phase C:前端 — 设置中心 UI

#### C1. 路由 + SettingsLayout

- [ ] `packages/frontend/src/router.tsx`:将 `/settings/account` 替换为嵌套路由(`/settings` + index redirect to appearance + 4 子路由)
- [ ] 新建 `packages/frontend/src/components/settings/SettingsLayout.tsx`:左侧导航(NavLink 列表:外观/账户/数据/关于)+ 右侧 `<Outlet />`,max-w-2xl 容器
- [ ] 新建 `packages/frontend/src/pages/SettingsAppearance.tsx`
- [ ] 新建 `packages/frontend/src/pages/SettingsData.tsx`
- [ ] 新建 `packages/frontend/src/pages/SettingsAbout.tsx`
- [ ] 重构 `packages/frontend/src/pages/SettingsAccount.tsx`(保留资料/密码,新增账户删除区)
- [ ] 验证:`pnpm --filter @taskora/frontend run typecheck` 通过

#### C2. SettingsAppearance 页面

- [ ] 主题:三选一(radio group 或 segmented control 风格的 button 组),调 `useTheme().setMode` + `useUpdatePreferences().mutate({ theme })`
- [ ] 语言:二选一,调 `i18n.changeLanguage` + `useUpdatePreferences().mutate({ language })`
- [ ] 每周起始日:二选一(周日/周一),调 `preferences.store.setWeekStartsOn` + `useUpdatePreferences().mutate({ weekStartsOn })`
- [ ] 同步失败 toast 提示(不回滚本地)

#### C3. Calendar 消费 weekStartsOn

- [ ] `packages/frontend/src/components/ui/calendar.tsx`:`CalendarProps` 新增 `weekStartsOn?: 0 | 1`,透传给 `DayPicker` 的 `weekStartsOn` prop
- [ ] `packages/frontend/src/components/task/fields/ScheduledDateField.tsx`:从 `preferences.store` 读取 `weekStartsOn` 传给 `Calendar`

#### C4. SettingsAccount 重构

- [ ] 保留现有资料表单 + 密码表单
- [ ] 新增账户删除区(Separator 分隔,dangerous 风格):密码输入框 + 删除按钮(`variant="destructive"`)
- [ ] 删除按钮点击 → 确认弹窗(Dialog)→ 输入密码 → `useDeleteAccount().mutate` → 成功后 `clear()` + `queryClient.clear()` + `navigate('/login')`

#### C5. SettingsData 页面

- [ ] 导出按钮 → `exportData()` → Blob → 下载 `taskora-export-YYYY-MM-DD.json`
- [ ] 按钮 loading 态(isPending)

#### C6. SettingsAbout 页面

- [ ] 显示应用名 Taskora、版本 0.1.0、技术栈(NestJS + React + Prisma + PostgreSQL)

#### C7. 侧边栏底部齿轮按钮调整

- [ ] `SidebarBottomBar.tsx`:齿轮按钮改为直接 `navigate('/settings/appearance')`(移除 DropdownMenu、主题切换项、语言切换项及相关 import)
- [ ] 移除 `useTheme` 的 `cycle` 引用(仍保留 `mode` 如果需要图标,但不再有 cycle 操作)

### Phase D:i18n

#### D1. 新增 settings namespace

- [ ] 新建 `packages/frontend/src/i18n/locales/zh/settings.json` + `en/settings.json`
- [ ] `i18n/config.ts` 注册 `settings` namespace
- [ ] key 包括:`appearance`(外观)、`account`(账户)、`data`(数据)、`about`(关于)、`theme`(主题)、`language`(语言)、`weekStartsOn`(每周起始日)、`sunday`(周日)、`monday`(周一)、`exportData`(导出数据)、`exportDescription`(导出说明)、`exportButton`(导出)、`exporting`(导出中…)、`exportFailed`(导出失败)、`deleteAccount`(删除账户)、`deleteAccountDescription`(删除账户说明)、`deleteAccountConfirm`(确认删除)、`deleteAccountConfirmDescription`(删除后数据不可恢复)、`deleteAccountConfirmAction`(删除)、`deleteAccountFailed`(删除失败)、`deleteAccountPasswordLabel`(输入密码以确认)、`appName`(Taskora)、`appVersion`(版本)、`techStack`(技术栈)、`light`(浅色)、`dark`(暗色)、`system`(跟随系统)
- [ ] 验证 zh/en key 集合一致(用 jq diff 命令)

#### D2. theme namespace 复用

- [ ] `theme.json` 已有 light/dark/system 文案,SettingsAppearance 可复用 `theme:light` 等;新增的 `settings:light` 等若与 theme 重复则优先复用 theme namespace,settings namespace 只放设置中心专属文案

### Phase E:集成验证

#### E1. 质量门

- [ ] `pnpm --filter @taskora/shared build`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] 手动验证:访问 `/settings/appearance` 切换主题/语言/周首日,日历周首日变化,刷新后偏好保持

## Validation Commands

```bash
# 后端迁移
cd packages/backend && pnpm exec prisma migrate dev --name add_user_preferences

# shared 构建
pnpm --filter @taskora/shared build

# 全量质量门
pnpm typecheck
pnpm lint
pnpm test

# i18n key parity
for f in common nav task project area tag auth search theme settings; do
  diff <(jq -S 'keys' packages/frontend/src/i18n/locales/zh/$f.json) \
       <(jq -S 'keys' packages/frontend/src/i18n/locales/en/$f.json) && echo "✓ $f"
done
```

## Risky Files / Rollback Points

| 文件 | 风险 | 回滚 |
|------|------|------|
| `prisma/schema.prisma` | 迁移不可逆(生产需 `migrate deploy`) | 删除 preferences 字段 + 新迁移 |
| `router.tsx` | 路由结构变更,影响现有 `/settings/account` 书签 | 恢复单路由 |
| `SidebarBottomBar.tsx` | 齿轮按钮交互从 DropdownMenu 变直接跳转 | 恢复 DropdownMenu |
| `calendar.tsx` | 新增 prop,影响所有 Calendar 使用方 | prop optional,默认值不改变现有行为 |
| `auth.store.ts` | AuthUser 类型变更 | preferences 为 nullable,不影响现有逻辑 |

## Review Gates

- A4 完成后:后端 API + 测试就绪,review 后端契约
- C7 完成后:前端 UI 全部就绪,review 前后端集成
- E1 完成后:全量质量门通过,准备 commit