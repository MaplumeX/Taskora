import React from 'react';
import ReactDOM from 'react-dom/client';
import { getVersion } from '@tauri-apps/api/app';

import pkg from '../package.json';
import '@taskora/api';
import { setAppVersion } from '@taskora/api';
import { App } from './App';
import { QuickAddApp } from './QuickAddApp';
import { bootQuickAdd } from './quickAddBoot';
import './index.css';

/**
 * Desktop entry: routes between the main window and the quick-add window
 * based on the `window` query param (see tauri.conf.json window URLs).
 */
async function mount() {
  // Desktop version comes from tauri.conf.json (via Tauri), falling back
  // to the desktop package.json when not running under Tauri (e.g. vitest).
  try {
    setAppVersion(await getVersion());
  } catch {
    setAppVersion(pkg.version);
  }

  const kind = new URLSearchParams(window.location.search).get('window');

  if (kind === 'quick-add') {
    await bootQuickAdd().catch(() => undefined);
    // The Quick Add window is its own webview with its own cache and its
    // own Event Stream connection (ADR 0005).
    const { QueryClient } = await import('@tanstack/react-query');
    const { initEventStream } = await import('@taskora/api');
    initEventStream(new QueryClient());
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <QuickAddApp />
      </React.StrictMode>,
    );
    return;
  }

  const { setAuthFlowNavigation } = await import('@taskora/api');
  // Desktop auth-flow navigation: the App component re-renders on auth
  // state changes (no URL navigation to /login — the shell swaps views).
  setAuthFlowNavigation({
    afterLogin: () => undefined,
    afterRegister: () => undefined,
    onLoggedOut: () => undefined,
  });

  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { Toaster } = await import('@taskora/ui/components/ui/sonner');

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // The Event Stream keeps caches fresh via push (ADR 0005); focus
        // refetch is superseded by reconnect + gap-triggered refetch.
        // refetchOnReconnect likewise: the WebView fires `online` when it
        // resumes after being backgrounded, which would refetch every
        // stale query and reintroduce the foreground flash.
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  // Event Stream singleton: connects after login, disconnects on logout.
  const { initEventStream } = await import('@taskora/api');
  initEventStream(queryClient);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        {/* 原生窗口装饰：App 直接铺满视口（h-dvh），与 web 端一致。 */}
        <App />
        <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void mount();
