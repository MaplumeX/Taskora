# 01: index.html 不做强缓存

Status: done

## 内容

改 `packages/frontend/nginx.conf`：

- 新增 `location = /index.html { add_header Cache-Control "no-cache"; }`。SPA fallback 的 `try_files ... /index.html` 会内部重定向到该精确匹配 location，从而带上头。
- `location /assets/` 的 `expires 1y` + `immutable` 保持不变（文件名带 hash，本来就该长缓存）。

`no-cache` 而非 `no-store`：仍带 ETag 校验，未变更时走 304，不会每次完整下载 HTML。

## 验收标准

- [x] `index.html` 响应带 `Cache-Control: no-cache`
- [ ] 部署后线上 `curl -sI https://task.maplume.de/` 与 `/inbox` 均可见该头（含 Cloudflare 透传，需发布后确认）

## Comments

- 2026-09-30：实现。事故现场 `curl -sI https://task.maplume.de/` 只有 `last-modified`，无任何 `Cache-Control`。
