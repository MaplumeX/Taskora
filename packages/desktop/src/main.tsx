import React from 'react';
import ReactDOM from 'react-dom/client';
import { getVersion } from '@tauri-apps/api/app';

import pkg from '../package.json';
import '@taskora/api';
import { setAppVersion } from '@taskora/api';
import { App } from './App';
import { TitleBar } from './TitleBar';
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
  // 窗口标记供 CSS 区分主窗口（自绘标题栏扣高）与 quick-add 弹窗。
  document.documentElement.dataset.window = kind ?? 'main';

  if (kind === 'quick-add') {
    await bootQuickAdd().catch(() => undefined);
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
        // Tauri webview focus events differ from browser tabs; keep
        // refetch-on-focus (maps to window focus) like the web client.
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TitleBar />
        <App />
        <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void mount();
