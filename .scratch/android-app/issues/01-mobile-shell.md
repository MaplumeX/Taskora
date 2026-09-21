# 01: packages/mobile Android 壳

Status: done

## 背景

Android 端是继 frontend/desktop 之后的第三个薄壳。技术选型：Tauri v2 mobile（ADR-0010），Android 独占。

## 内容

1. 新建 `packages/mobile`：Vite + React 入口、路由（复用 `@taskora/ui` 页面）、i18n、Tauri Android 工程与 `tauri.conf.json`（Android target、图标、权限声明）。
2. boot 流程：镜像 desktop 的 boot.ts 模式（服务端配置 → 登录态 → replica 初始化 → 进入主界面），登录页复用 `@taskora/ui` / `@taskora/frontend` 现有实现。
3. 移动布局验收：小屏下 TabBar + 抽屉生效（`hidden md:flex` 侧栏自动让位）、落地 Today、MobileFab 可用。
4. 版本号接入 monorepo 统一版本（`pnpm-workspace`、`scripts/release.mjs` 认识 mobile 包）。

## 验收标准

- [ ] `pnpm --filter @taskora/mobile dev` 可在 Android 模拟器/真机跑起完整 UI
- [ ] `pnpm typecheck` / `pnpm lint` 全绿
- [ ] 壳层导航测试（镜像 desktop `MainApp.test.tsx`）通过：TabBar 渲染、落地 Today、抽屉开合
- [ ] 未登录时进入登录页，登录后进入主界面

## Comments
