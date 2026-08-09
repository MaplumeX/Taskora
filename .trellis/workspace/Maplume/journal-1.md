# Journal - Maplume (Part 1)

> AI development session journal
> Started: 2026-07-25

---



## Session 1: Taskora GTD app planning + monorepo setup

**Date**: 2026-07-25
**Task**: Taskora GTD app planning + monorepo setup
**Branch**: `main`

### Summary

Created parent task 07-25-gtd-app with 4 child tasks (01-monorepo-setup, 02-backend-core, 03-frontend-core, 04-frontend-views). Completed brainstorm: confirmed MVP scope (Inbox/Today/Upcoming/Anytime/Someday/Projects/Areas/Trash + subtasks + dueDate), tech stack (NestJS+Prisma+PostgreSQL backend, React+Vite+Tailwind+shadcn/ui frontend, shared DTO package), pnpm monorepo, email+password auth, server-authoritative pull-based sync. Wrote design.md (data model with TaskBucket enum, API contract, backend/frontend architecture) and implement.md. Implemented and archived 01-monorepo-setup: pnpm workspaces, @taskora/shared package with DTOs/enums, ESLint flat config, Prettier, tsconfig.base. Populated backend/frontend directory-structure and quality-guidelines specs with real conventions.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `8e9db57` | (see git log) |
| `b234d05` | (see git log) |
| `2b77336` | (see git log) |
| `4b0379f` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: Backend core + frontend core implementation

**Date**: 2026-07-25
**Task**: Backend core + frontend core implementation
**Branch**: `main`

### Summary

Implemented and archived 02-backend-core and 03-frontend-core in parallel. Backend: NestJS with Prisma schema (User/Area/Project/Task + TaskBucket/TaskStatus enums), bcryptjs+JWT auth, task CRUD with bucket transition logic, view filtering (inbox/today/upcoming/anytime/someday/trash), soft delete, userId isolation on all queries. Fixed TaskQueryDto validation pipe issue (cross-type metadata loss). Frontend: React+Vite+TS, Tailwind CSS v3 with Things3 color scheme, shadcn/ui components, React Router with ProtectedRoute, axios with JWT interceptors and 401 redirect, Zustand auth store with localStorage persistence, TanStack Query v5 with proper query key conventions and invalidation. Updated backend spec: database-guidelines (Prisma patterns, soft delete, bucket transitions), error-handling (Prisma error mapping, ValidationPipe gotcha).

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `ab6d018` | (see git log) |
| `d274fc0` | (see git log) |
| `0d4f6f5` | (see git log) |
| `0aeaa9b` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: Frontend views implementation — MVP complete

**Date**: 2026-07-25
**Task**: Frontend views implementation — MVP complete
**Branch**: `main`

### Summary

Implemented and archived 04-frontend-views (final child task). All Things3 core views now functional: Inbox/Today/Upcoming/Anytime/Someday/Projects/Areas/Trash. Task components: TaskCheckbox with completion animation, TaskItem with date badge and context menu, TaskDetail Dialog with subtask management, QuickAddTask. Project/Area CRUD with forms and detail pages. Sidebar enhanced with lucide-react icons and collapsible project/area lists. Check agent fixed 4 issues: subtask display in detail (needed useTaskQuery for children data), duplicate subtask filtering in lists, missing QuickAddTask in Anytime, missing delete for projects/areas. Populated frontend spec: component-guidelines (structure, styling, common mistakes), hook-guidelines (query/mutation patterns, key conventions), state-management (three-layer architecture), type-safety (shared DTO import rules, enum type-only import trade-off). Parent task 07-25-gtd-app archived — all 4 children complete. MVP delivered.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `f9181c8` | (see git log) |
| `5d7b948` | (see git log) |
| `fc2241a` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 4: test-infra 实施与检查

**Date**: 2026-07-25
**Task**: 测试基建搭建 (`07-25-test-infra`)
**Branch**: `main`

### Summary

为 Taskora monorepo 建立可运行的测试基建。前后端统一用 vitest 2.1.x（Vite 5 兼容约束）。后端： vitest.config.ts + test/db.ts (resetDb via TRUNCATE + env guard) + AreasService 单测 6 例 (mock PrismaService 直接构造，vitest esbuild 不支持 emitDecoratorMetadata 故不用 Test.createTestingModule) + AreasController e2e 3 例 (NestJS Testing + supertest，无 TEST_DATABASE_URL 时 describe.skip 优雅跳过)。前端：vitest.config.ts + test/setup.ts (jest-dom) + useAreas hook 测试 3 例 + TaskCheckbox 组件测试 4 例。根 package.json 加 test 串联，backend 加 pretest (shared build + prisma generate)。spec 文档同步更新。无生产代码变更。

### Main Changes

- 新增 vitest 配置 + 测试文件（后端 9 例 / 前端 7 例）
- 更新 package.json 脚本 + devDependencies
- 更新 backend/frontend quality-guidelines.md 测试约定

### Git Commits

| Hash | Message |
|------|---------|
| (pending) | chore(test): add vitest test infrastructure |

### Testing

- `pnpm test`: 前端 7 passed，后端 6 passed + 3 skipped，退出码 0
- `pnpm typecheck`: 三包全通过
- `pnpm lint`: 0 errors 0 warnings

### Status

[OK] **Completed**

### Next Steps

- 归档 test-infra，继续 tags 或 logbook 子任务

## Session 5: tags + logbook 并行实施与合并

**Date**: 2026-07-25
**Task**: tags (`07-25-tags`) + logbook (`07-25-logbook`)
**Branch**: `main`

### Summary

两个子任务在独立 git worktree 中并行实施，然后手动合并到主工作树。6 个重叠文件（tasks.service.ts, tasks.dto.ts, Sidebar.tsx, router.tsx, tasks.api.ts, database-guidelines.md）手动合并成功。

Tags: 新增 Tag/TagGroup/TaskTag Prisma model + migration `add_tags`；Tags Module + TagGroups Module（CRUD，TagGroup 删除走 SetNull）；TasksService.update 加 tagIds 全量 set 语义（$transaction）；findAll/findOne include+map tags；前端 Tags 管理页 + TagDetail 筛选视图 + Sidebar Tags 区 + TaskDetail 多选标签 + TaskItem 徽章。7+5 测试用例。

Logbook: TasksService.findAll 加 logbook view（status=COMPLETED）+ 动态 orderBy（completedAt desc）；前端 Logbook 页面按今天/昨天/更早分组；Sidebar 加 Logbook 入口。3 测试用例。

合并后修复：test/db.ts 改为 lazy PrismaClient 避免模块加载失败；logbook 测试 mock 加 tags 字段；tasks.service.tags.spec mock 返回值加 tags 字段；TasksService.update 返回 include tags 保持一致性；TagDetail 过滤子任务；Tags.tsx 移除未使用 import；pnpm-workspace.yaml 用 approve-builds --all 修复 ERR_PNPM_IGNORED_BUILDS。

### Git Commits

| Hash | Message |
|------|---------|
| (pending) | feat: add tags + logbook features |

### Testing

- `pnpm test`: 后端 21 passed + 3 skipped，前端 7 passed，退出码 0
- `pnpm typecheck`: 三包全通过
- `pnpm lint`: 0 errors
- `pnpm --filter @taskora/frontend build`: 成功

### Status

[OK] **Completed**

### Next Steps

- 归档 tags 和 logbook，父任务 07-25-gtd-enhance 整合 review 后归档


## Session 4: Rename dueDate to scheduledDate + add new dueDate for notifications

**Date**: 2026-07-25
**Task**: Rename dueDate to scheduledDate + add new dueDate for notifications
**Branch**: `main`

### Summary

Renamed Task.dueDate to scheduledDate (计划日期) across schema/shared DTO/backend service+DTO/frontend/test fixture with a data-preserving RENAME COLUMN migration. Added a new nullable Task.dueDate (通知日期) field written by create/update but never passed to resolveBucket or any view query — isolated for future notification feature. Updated database-guidelines spec with dual date-field semantics.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `fccf4cb` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 5: scheduledType field and Someday as view refactor

**Date**: 2026-07-25
**Task**: scheduledType field and Someday as view refactor
**Branch**: `main`

### Summary

Add ScheduledType enum (NONE/DATE/SOMEDAY) to shared, prisma schema, backend DTO/service, and frontend. Remove SOMEDAY from TaskBucket; Someday is now a view filtered by scheduledType=SOMEDAY. Rewrite resolveBucket to be scheduledType-driven, add update cascade logic for scheduledType->scheduledDate, and update all view branches in findAll. Frontend: QuickAddTask uses scheduledType prop, TaskDetail gets None/Date/Someday segmented toggle, vite alias added for @taskora/shared runtime enum imports. Spec updated: database-guidelines bucket table and type-safety enum import guidance.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `01d949e` | (see git log) |
| `afa18a6` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 6: Content bottom bar with search modal and add-to-edit flow

**Date**: 2026-07-25
**Task**: Content bottom bar with search modal and add-to-edit flow
**Branch**: `feat/content-bottom-bar-task-actions`

### Summary

将顶部常驻搜索栏改为内容区底部共享栏（搜索 + 添加任务按钮）。搜索按钮弹出 Dialog 模态框（迁移原 SearchBar 防抖/勾选/结果列表逻辑），Cmd/Ctrl+K 打开搜索。添加任务按钮按 1B 方案：调用后端创建占位'新任务'任务（携带页面上下文：Today→dueToday、Someday→SOMEDAY、ProjectDetail→projectId），成功后通过 URL ?expand=<id> 触发该行展开，TaskRowExpanded 自动聚焦+全选标题。useTaskRowSelection 的 expandedId 从 useState 改为 useSearchParams 派生（spec 禁 Zustand 管 expandedId，改用 URL 状态层），selectedId 保持 useState。删除 SearchBar.tsx 与 QuickAddTask.tsx，移除 5 个页面的 QuickAddTask 渲染。spec component-guidelines.md 同步更新 expandedId 归属说明。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `e07dc71` | (see git log) |
| `241166c` | (see git log) |
| `620f9c7` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 7: 拖拽排序（任务/项目/区域） + 任务编辑组件布局重排

**Date**: 2026-07-25
**Task**: 拖拽排序 + 重新设计任务编辑组件布局
**Branch**: `feat/drag-sort-reorder` (merge of `feat/task-edit-expanded-layout`)

### Summary

拖拽排序：为 Task/Project/Area 三类列表加入 dnd-kit 拖拽排序，持久化到后端。后端新增 sortOrder 字段（Project/Area）+ POST /{tasks,projects,areas}/reorder 接口（updateMany + $transaction 保证 userId 隔离）；前端 useReorderXxx 半乐观更新（setQueriesData + invalidate）；TaskList/Projects/Areas/AreaDetail 接入 DnD，SearchModal 传 sortable={false} 隔离。spec 更新 reorder API 模式与 DnD 约定。

任务编辑布局重排：重新设计 TaskRowExpanded 展开编辑态布局，从上到下改为标题→备注→子任务区→图标按钮行（5个图标）。移除展开态内的标记完成文字按钮和删除按钮（均由折叠态行提供）。标题/备注采用无边框扁平样式。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `baf67e8` | feat: Add drag-and-drop reorder for tasks, projects, and areas |
| `1432490` | docs: Update specs with reorder API pattern and DnD conventions |
| `3a2ccd2` | chore: Add Trellis task artifacts for drag-sort-reorder |
| `6c3710e` | (task-edit-expanded-layout, merged from main) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 8: Add i18n support (zh/en) with locale-aware formatting

**Date**: 2026-07-25
**Task**: Add i18n support (zh/en) with locale-aware formatting
**Branch**: `feat/i18n-support`

### Summary

Introduced react-i18next with 9 namespaces (common/nav/task/project/area/tag/auth/search/theme) for zh/en. Added LanguageToggle in Sidebar with localStorage persistence (taskora-lang). Migrated ~200 hardcoded Chinese strings and English nav labels to translation keys across 15 pages and 10+ components. Refactored formatDateLabel to use Intl.DateTimeFormat(i18n.language) and i18n.t for today/tomorrow; deleted hardcoded WEEKDAYS array. Updated tests setup to init i18n. Added frontend spec: i18n-guidelines.md.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `57615ed` | (see git log) |
| `571d10f` | (see git log) |
| `4f3df22` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 9: 侧边栏底栏新增/设置按钮与标题内联编辑

**Date**: 2026-07-26
**Task**: 侧边栏底栏新增/设置按钮与标题内联编辑
**Branch**: `feat/sidebar-bottom-create-settings`

### Summary

重构侧边栏底栏：左新增按钮（下拉新增项目/区域，直接创建空标题条目并跳转详情页触发内联编辑），右设置按钮（收纳主题与语言切换）。新增通用 InlineTitleEdit 组件用于项目/区域详情页标题点击即编辑。补齐 zh/en i18n，更新 frontend spec。
## Session 9: Inline title editing in expanded task row

**Date**: 2026-07-26
**Task**: Inline title editing in expanded task row
**Branch**: `feat/task-edit-component-redesign`

### Summary

Eliminated duplicated title in expanded task rows: moved the editable title input from TaskRowExpanded up to the TaskItem top row so the title becomes editable in place when expanded, and read-only otherwise. TaskRowExpanded now receives live task data as a prop (single query subscription per row). Preserved new-task auto-focus/select, Enter-to-commit, Escape-to-revert behavior. Lint/typecheck/tests pass.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `193cc83` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 10: 新建任务/项目/区域空标题占位符展示

**Date**: 2026-07-26
**Task**: 新建任务/项目/区域空标题占位符展示
**Branch**: `feat/new-item-empty-title-placeholder`

### Summary

新建任务/项目/区域时标题存储为空字符串，UI 在空标题时显示占位符（新建任务/项目/区域）。改动：ContentBottomBar 新建任务 title:''；TaskItem 自动聚焦判定改为空值检测（取代 i18n 字符串匹配）；TaskItem/ProjectItem/AreaItem 空标题显示灰色占位符；ProjectDetail/AreaDetail 的 InlineTitleEdit placeholder 改为 newItemPlaceholder；i18n 新增 newTaskPlaceholder/newItemPlaceholder（中英），删除无引用的 task:newTask；spec 新增 ContentBottomBar 与空标题占位符约定文档。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `3d0d52f` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 11: 合并侧边栏项目与区域，删除 index 页面与路由

**Date**: 2026-07-26
**Task**: 合并侧边栏项目与区域，删除 index 页面与路由
**Branch**: `main`

### Summary

将侧边栏独立的「项目」「区域」两个 section 合并为一个以「项目」为标题的统一区域：顶部列出无区域归属的项目，下方每个区域作为带折叠按钮的条目（NavLink 进区域详情 + chevron 切换展开），展开后用 ProjectItem 渲染该区域下的项目，空态显示 area:noProjects。新建 SidebarProjectSection、SidebarAreaRow 组件，重构 Sidebar.tsx 移除旧两个 CollapsibleSection。删除 /projects、/areas index 路由及 Projects.tsx、Areas.tsx 页面，删除无引用的 AreaItem/AreaForm/ProjectForm 组件。清理 zh/en 无引用 i18n 键（nav:areas、nav:emptyProjects、nav:emptyAreas、area:empty、project:empty）。更新 frontend spec（directory-structure、component-guidelines）。tsc/eslint/i18n parity 全通过。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `cab82ff` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 12: Paper container for task editor

**Date**: 2026-07-26
**Task**: Paper container for task editor
**Branch**: `main`

### Summary

Referenced Milesto's TaskEditorPaper design to give the expanded task editor a 'paper' container visual. First pass applied paper styles to TaskRowExpanded root only, which left checkbox/title outside the card with a gray bg-muted backdrop. Fix moved paper styles up to TaskItem outer div so the entire expanded state (checkbox + title + notes + subtasks + icon buttons) sits inside one floating rounded card, and dropped the bg-muted/60 backdrop for expanded state.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `a457d46` | (see git log) |
| `b8ecae3` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 13: Refactor UI state: move expand/selected out of URL into Zustand stores

**Date**: 2026-07-26
**Task**: Refactor UI state: move expand/selected out of URL into Zustand stores
**Branch**: `main`

### Summary

Investigated why URL shows ?expand=<id> on task expand; identified root cause as state-management spec restricting Zustand to auth/token only, forcing UI state (expandedId via URL query, editTitle via router location.state with as-cast, theme via hand-rolled hook) into suboptimal carriers. Created task, planned full scope (prd/design/implement). Implemented: added uiInteraction.store.ts (non-persist: expandedId, pendingAutoEditId) and theme.store.ts (persist + applyTheme side-effect); useTaskRowSelection/useTheme delegate to stores keeping stable hook APIs (zero consumer changes); ContentBottomBar/SidebarBottomBar/ProjectDetail/AreaDetail migrated to store; removed as-cast editTitle pattern. Relaxed 5 spec files to 'Zustand for cross-component UI state, no server data caching'. typecheck/lint/build all green. URL now free of ?expand=; refresh loses expand/auto-edit (accepted).

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `29dfe01` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 14: 修复各界面添加任务按钮的上下文归属

**Date**: 2026-07-27
**Task**: 修复各界面添加任务按钮的上下文归属
**Branch**: `main`

### Summary

修复全局添加任务按钮在 /upcoming、/anytime、/areas/:id、/tags/:tagId 等页面创建任务时上下文归属错误的问题。扩展 usePageTaskContext 路由映射覆盖 anytime/areas/tags，shared+后端 CreateTaskDto 新增 tagIds 字段及 create() nested create 支持，/upcoming、/logbook、/trash 隐藏添加任务按钮。补充 create() tagIds 单测，更新前后端 spec。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `68158a0` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete

---

## 2026-07-28 — 子任务 A：账户自管理

### Summary
扩展 User 模型（displayName/avatarUrl/timezone/locale），新增 UsersModule（PUT /users/me, PUT /users/me/password），前端 SettingsAccount 页 + Sidebar 显示名/头像优先级 + i18n。

- Shared: `user.dto.ts` 新建；`AuthResponseDto.user` Pick 扩展字段。
- Prisma: 迁移 `20260728053300_add_user_profile_fields`（4× ADD COLUMN NULL，可逆）。
- Backend: `src/users/` 模块；`AuthService.getMe` 复用 `USER_PUBLIC_SELECT`；`login`/`register` 返回体补 displayName/avatarUrl（Check 阶段修复的契约缺口）；DTO 校验用自定义 `IsValidTimezone` + `IsIn(['zh','en'])` + `IsUrl(https)`。
- Frontend: `users.api.ts` + `useUsers.ts`（updateProfile 更新 store + invalidate auth.me）；`SettingsAccount.tsx`；路由 `/settings/account`；Sidebar dropdown 加「账户设置」。

### Testing
- backend: lint ✓ typecheck ✓ test ✓ (61 passed / 3 skipped e2e)
- frontend: lint ✓ typecheck ✓
- 新增 `test/users.dto.spec.ts`（7 测试，覆盖非法 timezone/locale/avatarUrl/whitelist/displayName 长度）+ `test/users.service.spec.ts`（6 测试）。

### Check Agent 发现并修复
- Issue 1（中）：login/register 返回缺 displayName/avatarUrl → 已修复。
- Issue 2（次）：缺非法输入测试 → 已补 `users.dto.spec.ts`。
- Issue 3（轻）：AuthUser 类型两处重复定义 → 仅提示，未处理。

### Next
- 子任务 B（Refresh Token）待启动。

## 2026-07-28 — 子任务 B：Refresh Token + 父任务集成

### Summary
引入 HttpOnly Cookie + 轮换 + reuse detection 的 Refresh Token 机制；access token 缩短到 15m，前端 token 内存化 + 启动恢复 + 401 自动刷新。

- Prisma: 迁移 `20260728054138_add_refresh_tokens`（RefreshToken 表：tokenHash unique / familyId / expiresAt / revokedAt；User 反向关系；cascade）。
- Backend: `refresh-token.helpers.ts`（generateRt/hashRt/COOKIE_OPTS）；AuthService 新增 issueRefreshToken/rotateRefreshToken(reuse detection + $transaction)/revokeRefreshToken；access expiresIn 15m。
- Controllers: /auth/login 写 cookie；/auth/refresh 公开路由 + Sec-Fetch-Site CSRF 校验 + 轮换；/auth/logout 吊销 + 清 cookie；@Res passthrough；main.ts 注册 cookieParser。
- Tests: `auth.service.spec.ts`（7 测试，含 reuse detection 全 family 吊销）。
- Frontend: token 不再 persist（仅 user 快照）；setToken/refreshing；client.ts 401 单飞锁 + 队列重放 + refresh 自身 401 不死循环；main.tsx 启动恢复；ProtectedRoute 挂起；useLogout 改 async。
- Cookie: rt, HttpOnly, Secure(prod), SameSite=Lax, Path=/auth, MaxAge=30d；rt 不泄露进 JSON body。

### Check Agent
全绿，无需修复。安全项确认：rt 不入 body、hash 比对、cookie 限定 Path=/auth、reuse detection 事务正确。

### 集成验收（父任务 cross-child）
- 后端 lint/typecheck/test ✓（68 passed / 3 skipped e2e）；前端 lint/typecheck ✓。
- /auth/refresh 返回的 user 含 child A 的 displayName/avatarUrl（auth.service.ts:165），契约一致。
- child A 的 users/account 模块零回归。

### Next
- 父任务归档；本次用户系统完善（账户自管理 + Refresh Token）全部完成。
- 后续可选：安全加固（限流/CORS 白名单/JWT 密钥回退）、注销账号、邮箱验证。


## Session 15: 用户系统完善：账户自管理 + Refresh Token

**Date**: 2026-07-28
**Task**: 用户系统完善：账户自管理 + Refresh Token
**Branch**: `main`

### Summary

实现用户系统两项增强。(1) 账户自管理：扩展 User 模型（displayName/avatarUrl/timezone/locale），新增 UsersModule（PUT /users/me, PUT /users/me/password）含 DTO 校验（timezone 白单/locale 枚举/avatarUrl https），前端 SettingsAccount 页 + Sidebar 显示名/头像优先级 + i18n。(2) Refresh Token：HttpOnly Cookie + 轮换 + reuse detection，access token 15m，RefreshToken 表（tokenHash unique/familyId），/auth/refresh 公开路由 + Sec-Fetch-Site CSRF，/auth/logout 吊销；前端 token 内存化 + 启动恢复 + 401 单飞锁队列重放。Check 阶段修复 login/register 返回体契约缺口。全流程测试通过（backend 68 passed, frontend lint/typecheck green）。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `3306c4b` | (see git log) |
| `049517c` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 16: Sidebar project/area drag-and-drop reordering

**Date**: 2026-07-28
**Task**: Sidebar project/area drag-and-drop reordering
**Branch**: `main`

### Summary

Implemented drag-and-drop in the sidebar project section: reorder standalone projects, reorder projects within an area, move projects across areas (including to standalone/null area), and reorder areas. Single outer DndContext with multiple SortableContexts using proj:/area: id prefixes; PointerSensor distance:5 preserves click navigation, NavLink, and chevron collapse. No backend changes (reused existing reorder/update APIs).

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `daa6a39` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 17: Task item context menu (right-click)

**Date**: 2026-07-29
**Task**: Task item context menu (right-click)
**Branch**: `main`

### Summary

为任务主任务行添加原生右键菜单：标记完成/未完成、设置计划时间、设置到期时间、设置标签、删除（软删除）。菜单用 @radix-ui/react-popover 虚拟锚点定位到鼠标坐标，不引入新依赖。将 TaskRowExpanded 的三个日期/标签 picker 抽取为共享 Field 组件（ScheduledDateField/DueDateField/TagsField），右键菜单与展开行复用同一 patch 语义。check 阶段修复了展开态右键误拦截输入框原生菜单的阻断问题：TaskContextMenu 仅包裹主任务行，TaskRowExpanded 移到包裹外。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `6f51d73` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 18: Trash task context menu with restore

**Date**: 2026-07-29
**Task**: Trash task context menu with restore
**Branch**: `main`

### Summary

Added a right-click context menu to trash task rows by extending TaskContextMenu with a variant prop ('default' | 'trash', default 'default'). The trash variant reuses all menu items (toggle complete, scheduled date, due date, tags) and swaps the destructive末项 from delete (useDeleteTask) to restore (useRestoreTask). Removed the inline restore button at Trash.tsx row tail so restore is only reachable via right-click, matching how normal rows expose delete only via the context menu. Default-variant behavior unchanged as a regression guard. Updated component-guidelines spec to document the variant and trash reuse.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `04fab6e` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 19: Fix trash row structure to match TaskItem

**Date**: 2026-07-29
**Task**: Fix trash row structure to match TaskItem
**Branch**: `main`

### Summary

Fixed a layout/pointer discrepancy on trash rows introduced by the previous trash-context-menu task. Wrapped each trash row in an outer data-task-item div (group flex flex-col transition-colors) mirroring TaskItem's idle-state root, so TaskContextMenu's flex-col wrapper no longer acts as the row container. Also moved the React key onto the new outer element. TaskContextMenu.tsx unchanged.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `770d019` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 20: Fix trash row hover cursor

**Date**: 2026-07-29
**Task**: Fix trash row hover cursor
**Branch**: `main`

### Summary

Fixed the real root cause of the trash-row vs normal-row pointer discrepancy: normal rows get cursor:pointer via role=button (when onRowClick is set), but trash rows had no click behavior so they showed the default arrow. Added cursor-pointer to the trash row content container to match the visual without introducing any click behavior. Previous task (770d019) had misdiagnosed this as a DOM nesting issue and added a data-task-item outer wrapper, which is harmless and kept as a structural alignment with TaskItem.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `426eae9` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## 2026-07-29 — Project 升级为与 Task 同级的待办实体

### Task
.trellis/tasks/archive/2026-07/07-29-project-as-todo-entity

### Changes
- Project 升级为与 Task 同级的待办实体：新增 status/bucket/scheduledType/scheduledDate/dueDate/completedAt/trashedAt 字段 + ProjectTag 关联表。
- 后端：ProjectsService 升级（resolveBucket / tagIds 全量 set / 软删除 / complete / restore）；抽取 buildTaskViewWhere / buildProjectViewWhere；新增 FeedModule（GET /feed?view=... 返回 Task+Project 混合 FeedItem[]）。
- 前端：Today/Upcoming/Anytime/Someday/Logbook/Trash/Inbox 改用 useFeedQuery；新增 FeedListView / FeedItemRow / ProjectFeedRow（点击跳转详情页）；ProjectDetail 增加字段编辑；task/project mutation 失效 ['feed']。
- Spec：database-guidelines 补充 Project 模型、ProjectTag、view→where 抽取、Feed 聚合接口约定。

### Status
[OK] **Completed** — build/lint/typecheck/test 全绿，独立 check 通过。


## Session 21: 项目条目右键菜单与详情页更多按钮

**Date**: 2026-07-29
**Task**: 项目条目右键菜单与详情页更多按钮
**Branch**: `main`

### Summary

新增 ProjectContextMenu（右键虚拟锚点版）与 ProjectMoreMenu（MoreHorizontal trigger 版），共享内部 ProjectMenuPanel，菜单项含完成切换/日期/到期/标签/删除（trash variant 显示恢复）。接入 ProjectItem 与 ProjectFeedRow 右键菜单；ProjectDetail 移除三按钮 IconPopover 行，标题后改用 ProjectMoreMenu。复用 task/fields/ 字段组件（cast 兼容），新增 common:more i18n key。更新 frontend 组件规范。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `5398d91` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 22: 项目详情标题前增加状态复选框

**Date**: 2026-07-29
**Task**: 项目详情标题前增加状态复选框
**Branch**: `main`

### Summary

在 ProjectDetail.tsx 标题前复用 TaskCheckbox，点击切换项目完成状态 (ACTIVE ⇄ COMPLETED)，复用 useCompleteProject/useUncompleteProject；未改后端与其他项目标题位置。typecheck/lint 通过。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `8745d4e` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 23: 区域界面底栏添加项目按钮

**Date**: 2026-07-29
**Task**: 区域界面底栏添加项目按钮
**Branch**: `main`

### Summary

在区域详情页 (/areas/:id) 的内容区底栏 ContentBottomBar 新增「添加项目」按钮（FolderPlus 图标）。点击创建带 areaId 的空标题项目，成功后 setPendingAutoEditId 并跳转项目详情页进入标题自动编辑态，与侧边栏「新建项目」行为一致。i18n 新增 project:addProject (zh/en)，spec 更新 ContentBottomBar 章节。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `066e978` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 24: Empty trash feature

**Date**: 2026-07-29
**Task**: Empty trash feature
**Branch**: `main`

### Summary

Added 'Empty Trash' feature: permanently delete all trashed tasks and projects for the current user via POST /feed/trash/empty. Backend FeedService.emptyTrash uses interactive $transaction with in-memory cascade set computation (trashed tasks ∪ recursive descendants per decision B ∪ tasks under trashed projects per decision B') to satisfy NO ACTION FK on Task.parentId and Task.projectId. Frontend Trash.tsx adds ghost 'Empty Trash' button (disabled when empty) + confirmation Dialog reusing existing Dialog component (no new radix-alert-dialog dep). useEmptyTrash hook invalidates feed/tasks/projects. 6 i18n keys in zh/en common.json. database-guidelines.md updated with 'physical delete exception' (only emptyTrash may deleteMany) and 'interactive transaction' notes. 7 backend unit tests (empty/single/cascade-B/multi-level/project-B'/status-isolation/userId-isolation) all green; typecheck/lint/i18n parity pass.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `c519edd` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 25: 修复删除逻辑一致性（Area FK + status 拆分 + 级联 trash/restore）

**Date**: 2026-07-30
**Task**: 修复删除逻辑一致性（Area FK + status 拆分 + 级联 trash/restore）
**Branch**: `main`

### Summary

修复三类删除逻辑问题：(1) Area 删除时 schema.prisma 补齐 onDelete: SetNull 注解（DB 已有约束，原只是注解缺失）；(2) TRASHED 从 TaskStatus/ProjectStatus enum 移除，status 只保留 ACTIVE|COMPLETED 纯生命周期，trashedAt 成为唯一删除判据——trash/restore 级联到子任务（Task BFS 后代收集 + Project 下属 task），只写 trashedAt 不动 status，COMPLETED 子任务 restore 后仍 COMPLETED；(3) spec 更新 database-guidelines.md 记录三处删除策略决策。3 子任务全部 implement + check 通过，测试 88 passed。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `c20cc0c` | (see git log) |
| `2c000c1` | (see git log) |
| `404659d` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 26: 区域详情页更多菜单：删除与标签能力

**Date**: 2026-07-30
**Task**: 区域详情页更多菜单：删除与标签能力
**Branch**: `main`

### Summary

为区域详情页标题行添加更多菜单按钮（AreaMoreMenu，MoreHorizontal 图标），菜单含标签与删除两项。后端新增 AreaTag join 表（与 ProjectTag 对称，@@unique([areaId, tagId])，onDelete: Cascade）+ migration；areas.service create/findAll/findOne/update 同步 tagIds 全量 set 语义（include+map，undefined 不动，传数组先删后建）；shared/backend DTO 加 tagIds，AreaResponseDto 加 tags。前端新建 AreaMoreMenu.tsx（popover+二级 picker 复用 TagsField，删除调 useDeleteArea + navigate('/today')），AreaDetail 标题行右侧集成。更新 backend/frontend spec 记录 AreaTag 与区域更多菜单。单元测试 89 passed，前端 build 通过；E2E 为 main 分支既有 DI 基础设施问题（pre-existing）。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `19495eb` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 27: Hide completed projects from sidebar

**Date**: 2026-07-31
**Task**: Hide completed projects from sidebar
**Branch**: `main`

### Summary

在 Sidebar.tsx 顶层过滤掉 status === COMPLETED 的项目，使已完成项目不再出现在侧边栏导航树。纯展示层过滤，后端 findAll 不变。更新 frontend component-guidelines spec 记录该约定。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `1e9d19c` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 28: 实现项目标题分组

**Date**: 2026-07-31
**Task**: 实现项目标题分组
**Branch**: `main`

### Summary

为项目详情页新增 Things 3 风格 Heading，支持创建、编辑、删除、完整布局拖拽与持久化；补齐并发事务保护、访问隔离、回归测试和规范文档。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `06d5dcc` | (see git log) |
| `6ac3835` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 29: Project detail notes field

**Date**: 2026-07-31
**Task**: Project detail notes field
**Branch**: `main`

### Summary

Added an inline notes Textarea to ProjectDetail.tsx below the title row, mirroring the Task notes interaction in TaskRowExpanded (local state + useEffect sync from query data + onBlur commit via useUpdateProject). Added project:notePlaceholder i18n key for en/zh. Backend/schema already supported Project.notes; no backend changes. check passed all ACs.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `c98c8f4` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 30: Add convert task to project action

**Date**: 2026-07-31
**Task**: Add convert task to project action
**Branch**: `main`

### Summary

Added 'Convert to Project' action to the task context menu. The task and all descendants are converted into a new standalone project within a single transaction: scalar fields and tags migrated, effectiveAreaId resolved from the task first then its parent project, descendant tasks reassigned to the new project (headingId cleared), direct children parentId cleared (avoids onDelete: NoAction), original task hard-deleted. Backend: POST /tasks/:id/convert-to-project. Frontend: api helper, useConvertTaskToProject mutation, context menu entry (default variant only), zh/en i18n.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `a559bcd` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 31: Delete project redirects to Today

**Date**: 2026-07-31
**Task**: Delete project redirects to Today
**Branch**: `main`

### Summary

Fix: deleting a project from the detail page More menu left the user on an empty /projects/:id shell. Threaded an onDeleted callback through the shared ProjectMenuPanel so only ProjectMoreMenu (detail-page only) navigates to /today on successful delete. Sidebar/feed ProjectContextMenu unchanged. typecheck + lint pass.

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `e3f1819` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 32: fix: 展开态输入框按 Enter 卡在 dnd-kit 拖拽态

**Date**: 2026-07-31
**Task**: fix: 展开态输入框按 Enter 卡在 dnd-kit 拖拽态
**Branch**: `main`

### Summary

修复任务展开态的子任务/标题/备注输入框按 Enter 提交后行卡在 isDragging 半透明态的 bug。根因：SortableTask/SortableTaskItem 把 {...listeners} 铺满整行，KeyboardSensor 把 Enter/Space 当作开始拖拽按键。方案：在 TaskRowExpanded/TaskItem 的可编辑控件 onKeyDown 对 Enter/Space stopPropagation，Escape 不阻断（保留根 div Escape 折叠）。新增回归测试 TaskRowExpanded.test.tsx。spec 更新 component-guidelines.md 事件隔离约定与 Common Mistake。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `66ba34e` | (see git log) |
| `cd5ba93` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 33: 独立 Subtask 表重构

**Date**: 2026-07-31
**Task**: 独立 Subtask 表重构
**Branch**: `main`

### Summary

将子任务从 Task 自引用 parentId 重构为独立 Subtask 表。新增 Subtask 模型（id/title/status/sortOrder/taskId CASCADE）+ SubtasksController(6 端点) + SubtasksService。TasksService 移除全部 parentId/BFS 逻辑，convertToProject 改为 subtask → task 提升。FeedService/ProjectHeadingsService 移除 BFS。前端新增 6 个 subtask hooks，TaskRowExpanded 适配 SubtaskResponseDto，列表视图移除 parentId 过滤。shared DTOs 更新。补 subtasks.service.spec + convert-to-project.spec。backend 124 tests + frontend 20 tests 全绿。同步更新 backend/frontend specs。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `7a1de03` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 34: Heading 转换为项目

**Date**: 2026-08-01
**Task**: Heading 转换为项目
**Branch**: `main`

### Summary

项目详情页 Heading 的 ⋯ 菜单新增“转换为项目”：以 Heading 标题创建新项目（areaId 继承原项目、sortOrder 侧边栏末尾、tags 为空），Heading 下全部顶层任务迁入新项目（Subtask 层级与字段保留），随后删除原 Heading。后端 POST /project-headings/:id/convert-to-project 单事务 + 6 单测；前端菜单项/hook/i18n/测试；lint/typecheck/test 全绿。语义对齐现有任务转换。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `b84403e` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 35: Docker 部署基础设施与 API v1 前缀

**Date**: 2026-08-01
**Task**: Docker 部署基础设施与 API v1 前缀
**Branch**: `main`

### Summary

记录版本管理与部署策略文档（docs/versioning-and-deployment.md），创建 Docker 部署基础设施（backend/frontend 双镜像 Dockerfile + nginx.conf + docker-compose.yml + .dockerignore），给 NestJS 加 /api/v1 全局前缀并同步适配 e2e 测试和 frontend baseURL。检查阶段发现并修复两个问题：refresh token cookie path 需同步到 /api/v1/auth、backend Dockerfile runtime 阶段需 corepack enable。更新 backend spec 记录 cookie path 同步 gotcha 和 Docker 部署注意事项。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `bdf4634` | (see git log) |
| `7e8402d` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 36: Add optimistic updates to high-frequency CRUD mutations

**Date**: 2026-08-07
**Task**: Add optimistic updates to high-frequency CRUD mutations
**Branch**: `main`

### Summary

为 Task/Subtask/Project/Area/Tag 五类实体的 CRUD mutation 添加乐观更新（onMutate snapshot + onError 回滚 + onSettled 同步真值），消除服务器部署后操作延迟感。新增 3 个测试文件、更新 1 个，共 51 个测试通过。更新 hook-guidelines.md spec 记录三段式模式。

### Git Commits

| Hash | Message |
|------|---------|
| `7e051a0` | (see git log) |

### Status

[OK] **Completed**


## Session 37: Optimize frontend first-load performance

**Date**: 2026-08-07
**Task**: Optimize frontend first-load performance
**Branch**: `main`

### Summary

路由级代码分割（14 页面 React.lazy + Suspense）+ vendor 拆包（react/query/i18n/dnd）+ nginx 静态资源长期缓存 + gzip 压缩。首屏 chunk 从 712KB 降至 330KB，页面按需加载，Vite 不再警告。lint/test/build 全绿。

### Git Commits

| Hash | Message |
|------|---------|
| `e20b15c` | (see git log) |

### Status

[OK] **Completed**


## Session 38: Remove skeleton loading design

**Date**: 2026-08-07
**Task**: Remove skeleton loading design
**Branch**: `main`

### Summary

完全移除前端骨架屏 loading 方案：删除 TaskListSkeleton 组件、useDelayedLoading hook、.skeleton CSS 类与 shimmer 动画；11 个页面 loading 期间改为渲染 null；更新 directory-structure spec。

### Git Commits

| Hash | Message |
|------|---------|
| `c64e726` | (see git log) |
| `e030727` | (see git log) |

### Status

[OK] **Completed**


## Session 39: Hide subtask section when task has no subtasks

**Date**: 2026-08-07
**Task**: Hide subtask section when task has no subtasks
**Branch**: `main`

### Summary

Implemented Plan A: the subtask block in TaskRowExpanded is no longer rendered when a task has zero subtasks. Added a ListPlus 'Add subtask' button to the icon row that reveals the block (auto-focusing the input) and, when subtasks exist, toggles the block open/collapsed. Removed the noSubtasks empty-state text. Updated TaskRowExpanded tests (empty/click-to-open/with-subtasks-default) and frontend component-guidelines spec.

### Git Commits

| Hash | Message |
|------|---------|
| `7a3857f` | (see git log) |

### Status

[OK] **Completed**


## Session 40: Hide add-subtask button when subtasks exist

**Date**: 2026-08-07
**Task**: Hide add-subtask button when subtasks exist
**Branch**: `main`

### Summary

Repurposed the ListPlus button in TaskRowExpanded from a subtask-block collapse toggle into a 'create first subtask' entry: it now only renders when there are no subtasks and disappears once subtasks exist. Replaced toggleSubtasksOpen with openSubtasks (expand-only + focus input). Updated TaskRowExpanded.test.tsx with an assertion that the button is absent when subtasks exist, and updated the frontend component-guidelines spec to reflect the new behavior.

### Git Commits

| Hash | Message |
|------|---------|
| `33cc094` | (see git log) |

### Status

[OK] **Completed**


## Session 41: Unify subtask row styling

**Date**: 2026-08-07
**Task**: Unify subtask row styling
**Branch**: `main`

### Summary

Replaced native HTML elements in SubtaskRow (TaskRowExpanded.tsx) with shadcn/ui components to match the rest of the app: TaskCheckbox for completion toggle, shadcn Input for inline title edit, shadcn Button ghost icon for delete. All stopPropagation and keyboard behavior preserved. Lint, type-check, and TaskRowExpanded tests all pass.

### Git Commits

| Hash | Message |
|------|---------|
| `73563ba` | (see git log) |

### Status

[OK] **Completed**


## Session 42: Calendar date picker for scheduled date field

**Date**: 2026-08-07
**Task**: Calendar date picker for scheduled date field
**Branch**: `main`

### Summary

把 ScheduledDateField 从「无/日期/Someday 三态 segmented control + 原生 date input」重构为 react-day-picker 月历面板：点日历图标直接弹月历，选日期=DATE、Someday=SOMEDAY、清除=NONE，scheduledType 由用户动作派生而非预先声明。底部加快捷「今天」按钮。新增 Calendar 基础 UI 组件（src/components/ui/calendar.tsx），Tailwind 样式走 CSS 变量适配 light/dark。新增 common:clear i18n key（zh/en）。DueDateField 未改。component-guidelines.md 日期编辑 Popover 段落已更新。check 全 AC 通过，typecheck/build/lint/54 tests 全绿。

### Git Commits

| Hash | Message |
|------|---------|
| `b4c2099` | (see git log) |
| `eed74f2` | (see git log) |

### Status

[OK] **Completed**


## Session 43: Project progress ring checkbox

**Date**: 2026-08-08
**Task**: Project progress ring checkbox
**Branch**: `main`

### Summary

Replaced folder icon on project rows with a circular progress ring (ProjectProgressRing) that visualizes task completion ratio and toggles project completion on click. Added taskTotalCount/taskCompletedCount to ProjectResponseDto and ProjectFeedItem; injected via two batched groupBy queries in ProjectsService and FeedService (no N+1, excludes subtasks, trashedAt-filtered). Updated backend/frontend specs.

### Git Commits

| Hash | Message |
|------|---------|
| `8f98607` | (see git log) |

### Status

[OK] **Completed**


## Session 44: Progress ring fixes: live updates, detail page, full-ring state

**Date**: 2026-08-08
**Task**: Progress ring fixes: live updates, detail page, full-ring state
**Branch**: `main`

### Summary

Fixed 3 issues: (1) useTasks mutations now invalidate ['projects'] so ring updates on task status change; (2) ProjectDetail swapped TaskCheckbox for ProjectProgressRing; (3) split isDone into isChecked (COMPLETED only, shows check) vs full ring (all tasks done, shows full arc without check). Updated component-guidelines and hook-guidelines specs.

### Git Commits

| Hash | Message |
|------|---------|
| `29d1c0d` | (see git log) |

### Status

[OK] **Completed**


## Session 45: 项目详情页已完成任务折叠区域

**Date**: 2026-08-08
**Task**: 项目详情页已完成任务折叠区域
**Branch**: `main`

### Summary

在项目详情页底部新增可折叠的已完成任务区域（ProjectCompletedTasks）。toggle 按钮显示「已完成 (N)」+ 计数，展开时按 completedAt 降序列出已完成任务，checkbox 可取消完成回到活跃区。展开偏好按 projectId 持久化到新建的 projectUiPrefs.store（Zustand + persist）。复用 TaskItem 折叠态，独立 query（completed: true）+ 前端过滤 COMPLETED。新增 zh/en i18n key project:completed。spec 更新：component-guidelines 补充归档区组件约定，state-management 补充 projectUiPrefs store。9 个组件测试，lint/typecheck/test 全通过。

### Git Commits

| Hash | Message |
|------|---------|
| `08d0d7a` | (see git log) |
| `55a2966` | (see git log) |

### Status

[OK] **Completed**


## Session 46: 统一菜单视觉美化（图标+分组+分隔线）

**Date**: 2026-08-08
**Task**: 统一菜单视觉美化（图标+分组+分隔线）
**Branch**: `main`

### Summary

为 TaskContextMenu/ProjectContextMenu/AreaMoreMenu 统一添加 lucide 图标、分组分隔线和 destructive hover 样式。提取共享 MenuRow 组件消除三处重复的 MENU_ITEM_CLASS。SidebarBottomBar 语言切换 ● 改为 Check 图标，新增菜单项加 FolderPlus/Layers。ProjectHeadingRow 危险项补 focus:bg-destructive/10。lint/test/build 全部通过。

### Git Commits

| Hash | Message |
|------|---------|
| `b8f0718` | (see git log) |

### Status

[OK] **Completed**


## Session 47: 设置中心重构与用户偏好持久化

**Date**: 2026-08-08
**Task**: 设置中心重构与用户偏好持久化
**Branch**: `main`

### Summary

将设置页从'账户资料编辑器'升级为完整设置中心,含外观/账户/数据/关于四个子路由页面。后端新增 User.preferences(Json?)+三个 API(preferences CRUD/delete account/export data)。前端偏好同步层:localStorage 快速层+后端跨端同步,hydrateFromServer 在 login/session recovery/useCurrentUser 三路径触发。Calendar 支持 weekStartsOn。侧边栏齿轮按钮改为直接跳转设置页。

### Git Commits

| Hash | Message |
|------|---------|
| `13ca604` | (see git log) |

### Status

[OK] **Completed**


## Session 48: Settings modal refactor

**Date**: 2026-08-08
**Task**: Settings modal refactor
**Branch**: `main`

### Summary

Refactored settings center from a full-page route (/settings with SettingsLayout + 4 child pages) to a global modal. New SettingsModal mounted in AppShell uses uiInteractionStore for open/tab state, reuses the 4 existing settings page components via lazy+Suspense with left-nav+right-content layout. Removed /settings routes from router.tsx, deleted SettingsLayout. Two entry points (SidebarBottomBar gear + Sidebar user menu) now call openSettings(tab). Specs updated to reflect modal mode.

### Git Commits

| Hash | Message |
|------|---------|
| `3fa326c` | (see git log) |

### Status

[OK] **Completed**


## Session 49: Task notes markdown WYSIWYG editor

**Date**: 2026-08-08
**Task**: Task notes markdown WYSIWYG editor
**Branch**: `main`

### Summary

Replaced plain Textarea with Tiptap v3 based MarkdownNotesEditor in TaskRowExpanded and ProjectDetail. Content stored as markdown string (backend unchanged), parsed/serialized via @tiptap/markdown. Added @tailwindcss/typography with .notes-prose CSS variable overrides. Keyboard stopPropagation uses bubble phase to avoid blocking ProseMirror keymap. Updated component-guidelines spec with editor conventions and capture-phase gotcha.

### Git Commits

| Hash | Message |
|------|---------|
| `9d657c8` | (see git log) |
| `52d251a` | (see git log) |
| `b004938` | (see git log) |

### Status

[OK] **Completed**


## Session 50: Fix trashed project detail page

**Date**: 2026-08-08
**Task**: Fix trashed project detail page
**Branch**: `main`

### Summary

修复废纸篓里的项目点击后打开为空壳页的问题。ProjectDetail 原先仅依赖 useProjectsQuery()（后端 findAll 过滤 trashedAt:null）+ .find()，trashed 项目不在列表中导致 project===undefined 降级。新增 useProjectQuery hook（后端 findOne 不过滤 trashedAt），采用「列表优先、未命中则按 id 单查」回退，trashed 项目详情页可显示真实标题/进度环/备注/任务列表。按方案 B2 完全可编辑：ProjectMoreMenu 按 project.trashedAt 切换 variant，trashed 末项显示「恢复」其余菜单项仍可用；取数失败显示 common:loadFailed 兜底。非 trashed 项目路径 foundInList 命中时 useProjectQuery enabled=false 不发请求，回归不变。改动仅 useProjects.ts（加 hook）+ ProjectDetail.tsx（取数/variant/兜底）。typecheck + lint 通过，check agent 无阻塞问题。更新 frontend spec 记录 ProjectDetail variant 切换与列表优先/findOne 回退取数流。

### Git Commits

| Hash | Message |
|------|---------|
| `0da3421` | (see git log) |

### Status

[OK] **Completed**


## Session 51: 为分组提供归档功能

**Date**: 2026-08-08
**Task**: 为分组提供归档功能
**Branch**: `main`

### Summary

为项目分组标题（ProjectHeading）实现归档功能。归档 = 标记 heading 为 COMPLETED 并级联完成其下所有 ACTIVE task；取消归档 = 只恢复 heading 为 ACTIVE，task 状态不变。Prisma 新增 HeadingStatus enum + completedAt 字段；后端新增 archive/unarchive 端点、findAll 过滤 ACTIVE + includeArchived 参数、reorder 校验对齐；前端 ProjectCompletedTasks 改造为归档 heading 分组展示 + 取消归档菜单，ProjectHeadingRow 新增归档菜单项。全量测试通过（后端 147 passed / 前端 68 passed），lint/typecheck/i18n parity 均通过。

### Git Commits

| Hash | Message |
|------|---------|
| `70bff57` | (see git log) |

### Status

[OK] **Completed**


## Session 52: Project completed panel preserve layout and in-place edit

**Date**: 2026-08-08
**Task**: Project completed panel preserve layout and in-place edit
**Branch**: `main`

### Summary

Restructured ProjectCompletedTasks to preserve pre-archive layout distribution (backend sortOrder instead of completedAt re-sort; ungrouped tasks on top, archived heading blocks below in sortOrder with their tasks grouped) and restore full in-place editing: completed task rows now expand via useTaskRowSelection, archived headings render via a new dual-state ProjectHeadingRow variant (COMPLETED hides drag handle, replaces Archive menu with Unarchive). No DndContext in completed panel — drag reorder intentionally unavailable. Updated component-guidelines spec to reflect the new conventions. 73 frontend tests pass; backend untouched.

### Git Commits

| Hash | Message |
|------|---------|
| `0f10d40` | (see git log) |
| `7892273` | (see git log) |

### Status

[OK] **Completed**


## Session 53: 优化任务跨分组拖动体验

**Date**: 2026-08-09
**Task**: 优化任务跨分组拖动体验
**Branch**: `main`

### Summary

实现项目任务跨分组拖动的紧凑浮层、实时占位、精确落点、取消恢复与单次持久化，并补齐碰撞、键盘、状态同步和失败回滚测试。

### Git Commits

| Hash | Message |
|------|---------|
| `922cfb2` | (see git log) |
| `bfa2d5d` | (see git log) |

### Status

[OK] **Completed**
