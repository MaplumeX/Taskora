# Feature: Web 部署后旧 chunk 自愈（Stale Chunk Recovery）

Status: done

## Problem Statement

Web 端每次发布都会重建带 hash 的 assets，并把镜像里上一版的文件整个删掉。此时仍停留在旧页面的浏览器（页面一直开着、或被缓存的旧 `index.html`）在懒加载路由时会 `import()` 到已被删除的 chunk：

```
Unexpected Application Error!
Failed to fetch dynamically imported module:
https://task.maplume.de/assets/Inbox-CBbab-ky.js
```

页面卡死在错误界面，**不会自愈**，用户只能手动刷新；而刷新也不一定立刻好——`index.html` 没有任何 `Cache-Control`，浏览器会按 `Last-Modified` 做启发式缓存，可能继续拿旧入口去请求旧 hash。

两个缺口：

1. `packages/frontend/nginx.conf` 只给 `/assets/` 设了 `immutable`（正确），但 SPA fallback 的 `index.html` 没有显式缓存指令。
2. 前端 16 个路由级 `lazy()` 没有任何 chunk 加载失败的恢复机制：无 `errorElement`、无 `ErrorBoundary`、无 `vite:preloadError` 处理。

## Solution

- **入口 HTML 每次校验**：nginx 对 `location = /index.html` 返回 `Cache-Control: no-cache`，保留 ETag/`Last-Modified`，未变更时走 304。`/assets/` 的 `immutable` 不动。
- **应用层自愈**：新增 `lazyWithRetry`，动态 import 失败时自动硬刷新以换到最新构建；`sessionStorage` 记录刷新时间戳做冷却（10s），保证真·网络故障或永久 404 时不会陷入刷新循环，冷却期内再失败照常抛给上层。同时安装 `vite:preloadError` 监听，拦截 modulepreload 失败。

两者缺一不可：只有 nginx 修复救不了「页面已经开着」的场景；只有自愈会刷到一个仍是旧的 `index.html`。

## User Stories

1. As a Taskora web user, I want a page left open across a deploy to recover by itself when I navigate to a lazily-loaded route, so that I never see `Failed to fetch dynamically imported module`.
2. As a Taskora web user, I want that recovery to be rate-limited by a cooldown, so that a real outage or a permanently missing chunk doesn't trap me in a refresh loop.
3. As a Taskora web user, I want a freshly loaded page to always get the latest entry HTML, so that a manual refresh actually fixes the problem.

## Verification

- 单测：`packages/frontend/src/lib/chunkRecovery.test.ts`、`lazyWithRetry.test.ts`（8 例）
- `pnpm --filter @taskora/frontend test` / `typecheck` / `build` 全绿
- 部署后线上验证：`curl -sI https://task.maplume.de/ | grep -i cache-control` 应出现 `no-cache`；旧 hash 资源 404 时导航不再白屏而是自动刷新一次
