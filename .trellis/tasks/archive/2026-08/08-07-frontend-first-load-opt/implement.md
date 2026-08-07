# Implement: Frontend First-Load Performance Optimization

## 执行顺序

### Phase A — 路由级代码分割

1. **改 `packages/frontend/src/router.tsx`**
   - 将 14 个页面组件的静态 import 改为 `React.lazy(() => import(...))`
   - 保持 `AppShell`、`ProtectedRoute` 为静态 import（首屏必需）
   - 在 AppShell 的 `<Outlet />` 外层包 `<Suspense fallback={...}>`，或在 router 的 layout element 层面包裹
   - fallback 用简单的 skeleton/spinner（复用现有 UI 组件，不引入新依赖）

2. **验证**
   - `pnpm --filter @taskora/frontend build` — 确认产物拆为多 chunk
   - 手动确认路由跳转正常

### Phase B — 第三方库拆包

3. **改 `packages/frontend/vite.config.ts`**
   - 添加 `build.rollupOptions.output.manualChunks`：
     - `react-vendor`: ['react', 'react-dom', 'react-router-dom']
     - `query-vendor`: ['@tanstack/react-query']
     - `i18n-vendor`: ['react-i18next', 'i18next']

4. **验证**
   - `pnpm --filter @taskora/frontend build` — 确认 vendor chunk 独立产出
   - 检查首屏 chunk 体积 < 500KB，Vite 不再警告

### Phase C — nginx 缓存与压缩

5. **改 `packages/frontend/nginx.conf`**
   - 添加 `gzip on` 及相关配置（gzip_types, gzip_vary, gzip_min_length）
   - 添加 `location /assets/` 块：`expires 1y` + `add_header Cache-Control "public, immutable"`
   - 保持 SPA fallback 和 API proxy 不变

6. **验证**
   - nginx 配置语法检查（`nginx -t` 如有环境，或构建时 Docker 验证）
   - 确认配置不破坏现有路由/代理

### Phase D — 全量验证

7. `pnpm --filter @taskora/frontend lint`
8. `pnpm --filter @taskora/frontend test`
9. `pnpm --filter @taskora/frontend build`
   - 检查产物：多 chunk、首屏 chunk < 500KB、Vite 无警告
   - 记录改造前后的 chunk 体积对比

## 验证命令

```bash
pnpm --filter @taskora/frontend lint
pnpm --filter @taskora/frontend test
pnpm --filter @taskora/frontend build
# 检查产物
ls -lh packages/frontend/dist/assets/
```

## 回滚点

- Phase A/B/C 独立，若某 Phase 引入回归，单独 revert 对应文件。
- 路由分割回滚：router.tsx 改回静态 import。
- vendor 拆包回滚：删除 vite.config.ts 的 manualChunks。
- nginx 回滚：还原 nginx.conf。

## Review Gates

- Phase A 完成后：确认路由跳转正常、页面渲染正常。
- Phase B 完成后：确认 chunk 体积达标。
- Phase D：lint + test + build 全部通过。

## 风险文件

- `packages/frontend/src/router.tsx` — lazy import + Suspense 改造，影响所有路由。
- `packages/frontend/vite.config.ts` — manualChunks 配置，影响构建产物。
- `packages/frontend/nginx.conf` — 缓存/gzip 配置，影响静态资源响应。