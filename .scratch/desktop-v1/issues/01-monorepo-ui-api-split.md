# 01: monorepo 拆分 packages/ui 与 packages/api

Status: done

## 背景

桌面端要复用 web 前端的业务组件和数据层。决策：新建 `packages/ui`（业务组件）与 `packages/api`（API client + Query hooks + 认证流），渐进式迁移，不是一次性大迁移。

## 内容

1. 建 `packages/ui`：V1 只迁移桌面端真正要用的业务组件（任务列表、任务编辑器、项目/区域视图等纯展示组件）。`frontend` 保持可独立运行。
2. 建 `packages/api`：TanStack Query hooks、API client、登录流程。关键点：**token 存储抽象**（web 端 localStorage 实现 / desktop 端钥匙串实现，通过依赖注入传入）。
3. `frontend` 改为依赖 `ui` + `api`，删除已迁移代码。
4. i18n 资源的归属：随组件进 `ui`（或引用方式）需在实现时确定。

## 验收标准

- [ ] `pnpm typecheck` / `pnpm test` / `pnpm lint` 全绿
- [ ] web 前端行为与迁移前完全一致
- [ ] `ui` 包不含 web 特定逻辑（路由、window 依赖）；`api` 包不含 UI 代码
- [ ] token 存储抽象有两种实现并被 frontend 使用

## Comments

Implemented in commits 3db4e04 (+d0e416c tests). `packages/api` holds the axios client, TokenStore abstraction (web: localStorage via `createLocalTokenStore`, desktop: keyring), query hooks, auth flow with injectable navigation, i18n resources and date/calendar utils. `packages/ui` holds all business components + page views. Frontend is shell-only; web behavior preserved (all 336 tests moved to ui/api and pass; legacy `taskora-auth` snapshot migrated on first load).
