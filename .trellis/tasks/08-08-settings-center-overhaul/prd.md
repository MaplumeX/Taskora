# 完善设置中心与用户偏好持久化

## Goal

将当前仅具备"账户资料编辑"功能的设置页升级为完整的设置中心,覆盖外观偏好、账户管理、数据导出、关于信息四个功能域,并将用户偏好(主题、语言、每周起始日)持久化到后端实现跨端同步。

## Background

### 现状

- 设置页 `/settings/account` 仅有个人资料(displayName / avatarUrl)+ 修改密码两块
- 主题(light / dark / system)和语言(zh / en)藏在侧边栏底部齿轮下拉,入口分散且不易发现
- 偏好全存 localStorage(`taskora-theme` / `taskora-lang`),换设备丢失,无法跨端同步
- 日历组件(react-day-picker)按 i18n.language 映射 locale,无 `weekStartsOn` 配置,使用 locale 默认值
- 后端 `User` model 无 preferences 字段;`PUT /users/me` 只能改资料,`PUT /users/me/password` 改密码
- 登出已在 Sidebar 用户菜单中(`useLogout` hook),不重复添加
- `User` 的所有关联(tasks / projects / areas / tags / tagGroups / refreshTokens)均为 `onDelete: Cascade`,删除用户级联清空全部数据

### 确认事实

| 事实 | 来源 |
|------|------|
| 主题存储:`theme.store.ts`,localStorage key `taskora-theme`,Zustand + persist | `packages/frontend/src/lib/stores/theme.store.ts` |
| 语言存储:i18next browser language detector,localStorage key `taskora-lang`,支持 zh / en | `packages/frontend/src/i18n/config.ts` |
| 日历无 weekStartsOn,用 locale 默认 | `packages/frontend/src/components/ui/calendar.tsx`、`ScheduledDateField.tsx` |
| 后端 User 无 preferences 字段 | `packages/backend/prisma/schema.prisma:10` |
| 后端仅有 `PUT /users/me`、`PUT /users/me/password` | `packages/backend/src/users/users.controller.ts` |
| User 关联全部 `onDelete: Cascade` | `packages/backend/prisma/schema.prisma` |
| 登出 hook 已存在 | `packages/frontend/src/lib/hooks/useAuth.ts` `useLogout` |
| app 版本 0.1.0 | `packages/frontend/package.json` |
| UI 库无 Tabs 组件 | `packages/frontend/src/components/ui/` |
| 后端 API 前缀 `/api/v1` | `packages/frontend/src/lib/api/client.ts` |

## Requirements

### R1:设置中心导航结构

- 设置中心采用子路由式布局,包含四个子页面:
  - `/settings/appearance` — 外观偏好
  - `/settings/account` — 账户管理(保留现有资料/密码功能,新增账户删除)
  - `/settings/data` — 数据导出
  - `/settings/about` — 关于
- 设置中心有左侧导航(子页面列表),点击切换子路由
- 从 Sidebar 用户菜单点击"账户设置"仍进入 `/settings/account`(保持现有入口)
- 侧边栏底部齿轮下拉中的主题/语言切换项移除,改为跳转到 `/settings/appearance`

### R2:外观偏好页(`/settings/appearance`)

- 主题选择:light / dark / system 三选一(替代侧边栏底部下拉的 cycle 切换)
- 语言选择:zh / en 二选一(替代侧边栏底部下拉的语言菜单)
- 每周起始日:周日(0)/ 周一(1)二选一
- 偏好变更即时生效(写入 localStorage 并应用到 DOM / i18n / Calendar)
- 偏好变更异步同步到后端(`PUT /users/me/preferences`)

### R3:偏好持久化与跨端同步

- 后端 `User` model 新增 `preferences` 字段(JSON 类型,存储 `{ theme, language, weekStartsOn }`)
- 新增 API:
  - `GET /users/me` 返回的 user 对象包含 `preferences` 字段
  - `PUT /users/me/preferences` 接受 `UpdatePreferencesDto`,更新 preferences
- 前端同步策略(localStorage 快速层 + 后端跨端同步):
  - 登录 / 页面刷新 → 从 `GET /users/me` 返回的 preferences 写入 localStorage(主题 / 语言)→ 应用
  - 用户改偏好 → 先更新 localStorage(即时生效)→ 异步 `PUT /users/me/preferences` 同步到后端
  - weekStartsOn 存入 preferences store,Calendar 组件读取该值
- `theme.store.ts` 和 i18n language 的 localStorage key 保持不变(`taskora-theme` / `taskora-lang`),后端 preferences 作为跨端同步层覆盖 localStorage

### R4:账户管理页(`/settings/account`)

- 保留现有:个人资料(displayName / avatarUrl)+ 修改密码
- 新增:账户删除区域
  - 用户须输入当前密码才能触发删除
  - 后端验证密码正确后 `prisma.user.delete`(级联清空所有数据)
  - 删除成功后前端 clear auth state 并跳转到 `/login`
  - UI 上与资料/密码区域有明确视觉分隔,使用 destructive 风格

### R5:数据导出页(`/settings/data`)

- 一键导出当前用户全部数据为单个 JSON 文件
- 导出内容包括:User 基本信息(不含密码)、Tasks、Subtasks、Projects、Areas、Tags、TagGroups、TaskTag / ProjectTag / AreaTag 关联、ProjectHeadings
- 后端新增 `GET /users/me/export`,返回完整 JSON
- 前端触发下载,文件名格式 `taskora-export-YYYY-MM-DD.json`
- 导出按钮有 loading 态

### R6:关于页(`/settings/about`)

- 显示应用名称(Taskora)、版本号(0.1.0)
- 显示技术栈简述(NestJS + React + Prisma + PostgreSQL)
- 可选:GitHub 链接(如有)

## Out of Scope

- 数据导入(单独任务处理)
- CSV 格式导出
- 通知 / 提醒设置(后端尚无相关能力)
- 会话管理(查看 / 吊销 refresh token 列表)
- 头像上传(仅保留 URL 输入)
- 快捷键说明页
- 偏好合并冲突解决(假设单用户单设备编辑,不处理并发写入冲突)

## Acceptance Criteria

- [ ] AC1:访问 `/settings/appearance` 可切换主题、语言、每周起始日,变更即时生效且页面不闪烁
- [ ] AC2:在 `/settings/appearance` 修改偏好后,刷新页面偏好保持;在另一设备登录同一账号,偏好同步过来
- [ ] AC3:日历组件(ScheduledDateField 的 Calendar)按 weekStartsOn 设置显示周首日
- [ ] AC4:侧边栏底部齿轮下拉不再有主题/语言切换项,改为跳转 `/settings/appearance`;或齿轮按钮直接跳转设置页
- [ ] AC5:`/settings/account` 保留资料编辑和修改密码功能,行为与改动前一致
- [ ] AC6:在 `/settings/account` 输入正确密码可删除账户,数据全部清除,跳转到 `/login`;输入错误密码拒绝删除
- [ ] AC7:在 `/settings/data` 点击导出可下载 `taskora-export-YYYY-MM-DD.json`,文件包含用户全部数据且结构完整
- [ ] AC8:`/settings/about` 显示应用名称、版本号、技术栈
- [ ] AC9:`prisma migrate dev` 生成迁移文件,`User.preferences` 字段存在且可为 null
- [ ] AC10:`PUT /users/me/preferences` 只接受合法的 theme / language / weekStartsOn 值,非法值返回 400
- [ ] AC11:`pnpm typecheck` 通过;`pnpm lint` 通过;`pnpm test` 通过