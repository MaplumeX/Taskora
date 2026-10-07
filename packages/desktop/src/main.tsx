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

  if (kind === 'tray-menu') {
    document.documentElement.classList.add('tray-menu-window');
    const { TrayMenuApp } = await import('./TrayMenuApp');
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <TrayMenuApp />
      </React.StrictMode>,
    );
    return;
  }

  if (kind === 'quick-add') {
    document.documentElement.classList.add('quick-add-window');
    await bootQuickAdd().catch(() => undefined);
    // The Quick Add window is its own webview with its own cache and its
    // own Event Stream connection (ADR 0005). Entity lists come from the
    // main window's snapshot (quick-add-client), so cached data never goes
    // stale on its own — no background REST refetches.
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const { initEventStream } = await import('@taskora/api');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    initEventStream(queryClient);
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <QuickAddApp />
        </QueryClientProvider>
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

  // Local-first Engine（完全体，ADR-0007/V2）：登录后全部实体读写切换到
  // 本地副本（Tauri 侧 SQLite），Event Stream 之外的同步走 /sync 推拉。
  // 仅主窗口装配；quick-add 窗口经事件中继复用本实例（单一 Outbox/HLC）。
  const { initDesktopEngine } = await import('./engine/desktop-engine');
  initDesktopEngine(queryClient);

  // Reminders（reminders spec）：注册通知薄壳，UI 提醒区据此获得授权
  // 状态与跳转系统设置能力（web 前端不注册 → 提醒区隐藏）。
  const { setNotificationShell } = await import('@taskora/api');
  const { createDesktopNotificationShell } = await import('./reminders/tauri-notification-shell');
  setNotificationShell(createDesktopNotificationShell());

  // quick-add 事件中继：主窗口代为执行 quick-add 的任务创建。
  const { initQuickAddRelay } = await import('./quick-add-relay');
  initQuickAddRelay();

  // 托盘悬停提示 / Linux 原生托盘菜单跟随 App 语言。
  const { installTrayLabels } = await import('./tray-labels');
  installTrayLabels();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        {/* 原生窗口装饰：App 直接铺满视口（h-dvh），与 web 端一致。 */}
        <App />
        <Toaster position="top-center" />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void mount();
