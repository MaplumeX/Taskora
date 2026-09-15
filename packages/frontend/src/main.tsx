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
  readLegacyAuthSnapshot,
  setAppVersion,
  setUnauthorizedHandler,
} from '@taskora/api';
import { router } from '@/router';
import { tryRecoverSession } from '@/lib/sessionRecovery';
import '@/index.css';

// Apply theme synchronously before React renders to prevent FOUC
applyThemeFromStorage();

// Web version comes from the frontend package.json.
setAppVersion(pkg.version);

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

// Kick off recovery (restores the user after a full page reload) before
// rendering so ProtectedRoute can wait on `refreshing`.
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
