import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { Toaster } from '@taskora/ui/components/ui/sonner';
import {
  apiClient,
  applyThemeFromStorage,
  configureTokenStore,
  createLocalTokenStore,
  hydrateAuthSnapshot,
  readLegacyAuthSnapshot,
  refresh,
  setUnauthorizedHandler,
  useAuthStore,
  hydrateFromServer,
} from '@taskora/api';
import { router } from '@/router';
import '@/index.css';

// Apply theme synchronously before React renders to prevent FOUC
applyThemeFromStorage();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

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

// Startup recovery: if we have a persisted user snapshot but no in-memory token,
// try to silently refresh via the HttpOnly cookie.
async function tryRecoverSession() {
  const { user, token, setAuth, clear, setRefreshing } = useAuthStore.getState();
  if (token || !user) return;

  setRefreshing(true);
  try {
    const data = await refresh();
    setAuth(data.accessToken, data.user);
    hydrateFromServer(data.user.preferences ?? null);
  } catch {
    clear();
  } finally {
    setRefreshing(false);
  }
}

// Kick off recovery before rendering so ProtectedRoute can wait on `refreshing`.
const recoveryPromise = tryRecoverSession();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  </React.StrictMode>,
);

// Surface unhandled recovery errors to the console (rejection already handled internally).
void recoveryPromise;
