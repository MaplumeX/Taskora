# Optimize Frontend First-Load Performance

## Goal

减少前端首屏加载的 JS 体积和加载时间，让用户打开应用时更快看到可交互界面。

## Background

当前前端构建产物是一个 712KB 的单一 JS 包（gzip 220KB），包含所有 13 个页面、所有组件和所有第三方库。用户打开任何一个路由都要下载整个包。Vite 已警告 "chunks larger than 500 kB"。

nginx.conf 未给静态资源设置缓存头，也未启用 gzip 压缩。

## 已确认事实（代码证据）

- 构建产物：`dist/assets/index-*.js` 712KB（gzip 220KB），`dist/assets/index-*.css` 27KB（gzip 6KB）。Vite 警告 chunk > 500KB。
- `packages/frontend/vite.config.ts`：无 `build.rollupOptions` 配置，无 manualChunks。
- `packages/frontend/src/router.tsx`：13 个页面全部静态 import（`import Today from '@/pages/Today'`），未用 `lazy()` / `Suspense`。
- 所有页面组件均为 `export default function`，适合 `React.lazy(() => import(...))`。
- `packages/frontend/src/main.tsx`：`<RouterProvider router={router} />`，router 在模块顶层创建。
- `packages/frontend/nginx.conf`：无 `expires` / `Cache-Control` 静态资源缓存头，无 `gzip` 配置。
- Dockerfile 两阶段构建：build 阶段 `VITE_API_URL=/api/v1`，runtime 阶段 nginx 直接托管 dist/。
- 页面列表：Login, Register, Inbox, Today, Upcoming, Anytime, Someday, Logbook, ProjectDetail, AreaDetail, Tags, TagDetail, Trash, SettingsAccount（14 个页面）。

## Requirements

- R1 路由级代码分割：所有页面组件改为 `React.lazy(() => import(...))` 动态导入，用 `Suspense` 包裹，使首屏只加载当前路由的代码。
- R2 第三方库拆包：在 vite.config.ts 配置 `manualChunks`，将 react/react-dom/react-router-dom、@tanstack/react-query、i18next 等大库拆成独立 vendor chunk，利用长期缓存。
- R3 nginx 静态资源缓存：为 `/assets/` 路径设置长期缓存头（`expires 1y` + `Cache-Control: public, immutable`），因为 Vite 产物文件名带 hash 可安全长期缓存。
- R4 nginx gzip 压缩：启用 gzip，压缩 JS/CSS/JSON 等文本资源。
- R5 不改应用功能与行为，不改后端，不改 API 契约。
- R6 构建通过、现有测试通过、lint 通过。

## Acceptance Criteria

- [ ] 构建产物从单一 712KB JS 包拆分为多个 chunk：首屏 chunk + 按路由加载的页面 chunk + vendor chunk。
- [ ] 首屏（/today 路由）加载的 JS 总量（首屏 chunk + vendor chunk）显著低于当前 712KB。
- [ ] 页面切换时按需加载对应 chunk，不一次性加载所有页面。
- [ ] nginx 对 /assets/ 返回长期缓存头（Cache-Control: public, immutable，expires 1y）。
- [ ] nginx 启用 gzip，JS/CSS 响应带 Content-Encoding: gzip。
- [ ] 应用功能不回归：路由跳转、页面渲染、登录/登出正常。
- [ ] `pnpm --filter @taskora/frontend lint` 通过。
- [ ] `pnpm --filter @taskora/frontend test` 通过。
- [ ] `pnpm --filter @taskora/frontend build` 通过，Vite 不再报 chunk > 500KB 警告（或首屏 chunk < 500KB）。

## Out of Scope

- 后端性能优化、数据库查询优化（独立任务）。
- 图片/字体优化、CDN 配置、HTTP/2 或 Brotli（可后续单独做）。
- Prefetch/preload 策略（可在基础优化验证后再考虑）。
- 改变应用功能或 UI 行为。