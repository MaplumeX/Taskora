# Design: Frontend First-Load Performance Optimization

## 架构边界

- 改 `packages/frontend/src/router.tsx`（路由级 lazy import + Suspense）
- 改 `packages/frontend/src/main.tsx`（Suspense fallback，如需）
- 改 `packages/frontend/vite.config.ts`（manualChunks）
- 改 `packages/frontend/nginx.conf`（静态资源缓存 + gzip）
- 不改后端、不改 API、不改组件内部逻辑

## 1. 路由级代码分割

### 改造方案

`router.tsx` 将 14 个页面的静态 import 改为 `React.lazy` 动态 import，用 `Suspense` 包裹路由出口。

```tsx
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';

// 保持静态 import 的组件（布局/鉴权，首屏必需，不拆）：
// - AppShell, ProtectedRoute

// 页面组件改为 lazy
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const Today = lazy(() => import('@/pages/Today'));
const Inbox = lazy(() => import('@/pages/Inbox'));
// ... 其余 10 个页面同理
```

### Suspense 包裹策略

`createBrowserRouter` 的 element 用 `Suspense` 包裹每个 lazy 页面。两种方式：

**方式 A（推荐）：统一 Suspense 出口**
在 AppShell 的 `<Outlet />` 外层包一个 `<Suspense>`，所有子路由共享一个 fallback：

```tsx
// AppShell.tsx 内部（或 router.tsx 的 layout element）
<Suspense fallback={<PageSkeleton />}>
  <Outlet />
</Suspense>
```

方式 A 的优点：只改一处，所有路由自动获得 Suspense 边界。

**方式 B：每个路由单独 Suspense**
在 router.tsx 每个路由 element 上包 `<Suspense>`，更细粒度但更冗余。

### fallback 设计

用已有的 UI 组件做骨架屏（skeleton），避免引入新依赖：
- 一个简单的居中 Spinner 或 `Skeleton`（shadcn/ui 已有）
- 不用完整的页面骨架（增加复杂度，收益低）

### 保持静态 import 的组件

以下组件首屏必需，不拆分：
- `AppShell`（布局框架，首屏立即渲染）
- `ProtectedRoute`（鉴权逻辑，首屏立即执行）
- `Toaster`（main.tsx 中，toast 容器）

### 对 tryRecoverSession 的影响

`main.tsx` 的 `tryRecoverSession` 在模块顶层执行，不受 lazy import 影响。`RouterProvider` 渲染时 lazy 页面开始加载，`ProtectedRoute` 静态加载先执行鉴权判断。流程兼容。

## 2. 第三方库拆包（manualChunks）

### 改造方案

`vite.config.ts` 添加 `build.rollupOptions.output.manualChunks`：

```ts
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { ... } },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'i18n-vendor': ['react-i18next', 'i18next'],
        },
      },
    },
  },
});
```

### 分包策略

| chunk | 包含 | 理由 |
|---|---|---|
| `react-vendor` | react, react-dom, react-router-dom | 变化频率极低，长期缓存 |
| `query-vendor` | @tanstack/react-query | 独立缓存 |
| `i18n-vendor` | react-i18next, i18next | 独立缓存 |

不把所有第三方库都拆——只拆体积大且变化频率低的。radix-ui 等小组件库随页面 chunk 自然分割即可。

### 兼容性

manualChunks 不影响开发模式（dev 用 ESM 无打包），仅影响 production build。

## 3. nginx 静态资源缓存

### 改造方案

`nginx.conf` 增加 `/assets/` 的缓存头和 gzip：

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源长期缓存（Vite 产物文件名带 hash）
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API reverse proxy
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 缓存策略

- `/assets/` 下文件名带 hash（`index-DpmvnAya.js`），内容变 → hash 变 → 文件名变 → 浏览器自动下载新文件。可安全设 `immutable` + `1y`。
- `index.html` 不缓存（通过 `/` 的 `try_files` 返回，默认无 Cache-Control，每次请求都拉最新版以获取新 hash 引用）。
- 需确认：nginx 默认对 `/` 路径的 index.html 是否有缓存头。若无显式设置，浏览器会发条件请求（304），可接受。

## 4. 预期产物结构

改造后构建产物预期：

```
dist/assets/
  react-vendor-[hash].js     # react + react-dom + router
  query-vendor-[hash].js     # tanstack/react-query
  i18n-vendor-[hash].js      # i18next
  index-[hash].js            # 首屏代码（AppShell + ProtectedRoute + 框架逻辑）
  index-[hash].css           # 样式
  Today-[hash].js            # /today 页面（首屏路由，按需加载）
  Inbox-[hash].js            # /inbox 页面
  ... 其余页面 chunk
```

首屏加载量 = index.js + react-vendor + query-vendor + i18n-vendor + Today.js + index.css
预计：200-300KB（gzip 60-100KB），比当前 712KB（gzip 220KB）显著降低。

## 风险与权衡

| 风险 | 缓解 |
|---|---|
| lazy 页面加载时有短暂空白 | Suspense fallback 用 skeleton/spinner，加载通常 <200ms |
| manualChunks 配置不当导致循环依赖或 chunk 过大 | 只拆明确的大库，不过度拆分；构建后检查 chunk 体积 |
| index.html 被浏览器缓存导致旧 hash 引用 | nginx 默认不缓存 index.html；如需可显式 `add_header Cache-Control "no-cache"` |
| 现有测试是否依赖静态 import | 测试主要在 hooks 层，不涉及 router；检查确认 |

## 测试策略

- 现有测试保持通过（hooks 测试不涉及路由）。
- 构建验证：检查产物从单 chunk 拆为多 chunk，首屏 chunk < 500KB，Vite 不再警告。
- 手动验证：路由跳转正常、页面渲染正常、登录/登出正常。