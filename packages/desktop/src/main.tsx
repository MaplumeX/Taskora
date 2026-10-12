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
 * Desktop entry: routes between the main window, secondary windows
 * (multi-window) and the quick-add window based on the `window` query param
 * (see tauri.conf.json window URLs and windows.rs).
 */
async function mount() {
  // Desktop version comes from tauri.conf.json (via Tauri), falling back
  // to the desktop package.json when not running under Tauri (e.g. vitest).
  try {
    setAppVersion(await getVersion());
  } catch {
    setAppVersion(pkg.version);
  }

  const params = new URLSearchParams(window.location.search);
  const kind = params.get('window');
  // 副窗口（多窗口，.scratch/multi-window）：与主窗口同一套界面，打开时的
  // 路由由 open_window 带入；数据经主窗口的 Engine 读写（ADR-0025）。
  const secondary =
    kind === 'secondary' ? { initialRoute: params.get('route') || '/today' } : undefined;

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
  // 自绘外壳：主窗口无原生标题栏（lib.rs），先写入拖拽带高度再挂载。
  const { WindowChrome, installWindowChrome } = await import('./WindowChrome');
  installWindowChrome();

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

  if (secondary) {
    // 副窗口：UI 读写经主窗口的 Engine；登出时关闭自己。
    const { initSecondaryEngine } = await import('./windows/secondary-engine');
    initSecondaryEngine(queryClient);
    const { coupleSecondaryWindowSession } = await import('./windows/session');
    coupleSecondaryWindowSession();
  } else {
    // Local-first Engine（完全体，ADR-0007/V2）：登录后全部实体读写切换到
    // 本地副本（Tauri 侧 SQLite），Event Stream 之外的同步走 /sync 推拉。
    // 仅主窗口装配；quick-add 窗口经事件中继、副窗口经窗口通道复用本实例
    // （单一 Outbox/HLC，ADR-0025）。
    const { initWindowHost } = await import('./windows/engine-host');
    initWindowHost();
    const { initDesktopEngine } = await import('./engine/desktop-engine');
    initDesktopEngine(queryClient);
    const { coupleMainWindowSession } = await import('./windows/session');
    coupleMainWindowSession();
  }

  // 多窗口：「在新窗口中打开」、⌥ + 点击、⌃⌘N。
  const { installWindowOpener } = await import('./windows/open-window');
  installWindowOpener();

  // 自动更新（ADR-0026）：目标是所连服务器的版本；仅主窗口检查与提示。
  // 副窗口没有自己的 Engine，重启前推送 Outbox 只能由主窗口做。
  if (!secondary) {
    const { setUpdateShell, initUpdateChecks } = await import('@taskora/api');
    const { desktopUpdateShell } = await import('./updates/desktop-update-shell');
    setUpdateShell(desktopUpdateShell);
    initUpdateChecks();
  }

  // 附件（ADR-0019）：用系统默认程序打开，而不是 webview 里的下载。
  // 上次没传完的 Blob 只由主窗口续传。
  const { setAttachmentOpener, initBlobUploads } = await import('@taskora/api');
  const { tauriAttachmentOpener } = await import('./tauri-attachment-opener');
  setAttachmentOpener(tauriAttachmentOpener);
  if (!secondary) initBlobUploads();

  // Reminders（reminders spec）：注册通知薄壳，UI 提醒区据此获得授权
  // 状态与跳转系统设置能力（web 前端不注册 → 提醒区隐藏）。
  const { setNotificationShell } = await import('@taskora/api');
  const { createDesktopNotificationShell } = await import('./reminders/tauri-notification-shell');
  setNotificationShell(createDesktopNotificationShell());

  if (!secondary) {
    // quick-add 事件中继：主窗口代为执行 quick-add 的任务创建。
    const { initQuickAddRelay } = await import('./quick-add-relay');
    initQuickAddRelay();

    // 托盘悬停提示 / Linux 原生托盘菜单跟随 App 语言。
    const { installTrayLabels } = await import('./tray-labels');
    installTrayLabels();
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        {/* 自绘外壳：App 仍铺满视口（h-dvh），各栏按 --titlebar-h 让出顶部拖拽带。 */}
        <App secondary={secondary} />
        <WindowChrome />
        <Toaster
          position="top-center"
          offset={{ top: 'calc(24px + var(--titlebar-h))' }}
          mobileOffset={{ top: 'calc(16px + var(--titlebar-h))' }}
        />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void mount();
