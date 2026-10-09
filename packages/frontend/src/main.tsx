import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import pkg from '../package.json';
import { Toaster } from '@taskora/ui/components/ui/sonner';
import {
  apiClient,
  applyThemeFromStorage,
  configureTokenStore,
  createLocalTokenStore,
  hydrateAuthSnapshot,
  initBlobUploads,
  initEventStream,
  readLegacyAuthSnapshot,
  setAppVersion,
  setUnauthorizedHandler,
} from '@taskora/api';
import { router } from '@/router';
import { installChunkLoadRecovery } from '@/lib/chunkRecovery';
import { tryRecoverSession } from '@/lib/sessionRecovery';
import { initWebEngine } from '@/engine/web-engine';
// 登录/注册/登出后的导航回调在此注册（副作用 import，必须先于页面加载）。
import '@/lib/hooks/useAuth';
import '@/index.css';

// Apply theme synchronously before React renders to prevent FOUC
applyThemeFromStorage();

// 部署后旧 chunk 失效时自动刷新换到新构建（懒加载 import 失败 /
// modulepreload 失败，带冷却时间戳防刷新循环）。
installChunkLoadRecovery();

// Web version comes from the frontend package.json.
setAppVersion(pkg.version);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // The Event Stream keeps caches fresh via push (ADR 0005);
      // reconnect + gap-triggered refetch is the only backstop needed.
      // refetchOnReconnect too: it defaults to true and fires on the
      // browser `online` event, refetching all stale queries.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

// Event Stream singleton: connects after login, disconnects on logout,
// applies Change Events straight onto the query cache.
initEventStream(queryClient);

// 附件（ADR-0019）：登录后续传上次没传完的文件。
initBlobUploads();

// Local-first Engine（local-first-v3 issue 05）：登录后实体读写切到 OPFS
// 里的本地副本，多标签页由 leader 独占副本；浏览器不支持时保持 REST。
initWebEngine(queryClient);

// Web wiring: localStorage-backed token store + API base URL from env.
configureTokenStore(createLocalTokenStore());
if (import.meta.env.VITE_API_URL) {
  apiClient.defaults.baseURL = import.meta.env.VITE_API_URL;
}

// 401-after-refresh-failure → back to the login page.
setUnauthorizedHandler(() => {
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
});

// Restore the session from the persisted token (+ legacy user snapshot).
hydrateAuthSnapshot(readLegacyAuthSnapshot());

// Kick off recovery (restores the user after a full page reload) before
// rendering so ProtectedRoute can wait on `refreshing`.
const recoveryPromise = tryRecoverSession(queryClient);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </QueryClientProvider>
  </React.StrictMode>,
);

// Surface unhandled recovery errors to the console (rejection already handled internally).
void recoveryPromise;
