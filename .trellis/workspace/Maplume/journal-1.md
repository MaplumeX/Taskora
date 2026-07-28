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
