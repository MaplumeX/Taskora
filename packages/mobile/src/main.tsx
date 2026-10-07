import React from 'react';
import ReactDOM from 'react-dom/client';
import { getVersion } from '@tauri-apps/api/app';

import pkg from '../package.json';
import '@taskora/api';
import { setAppVersion } from '@taskora/api';
import { App } from './App';
import { installKeyboardInset } from './keyboard-inset';
import { installSafeAreaInsets } from './safe-area-insets';
import { installSystemBarAppearance } from './system-bar-appearance';
import { installSystemTheme } from './system-theme';
import './index.css';

/**
 * Android 壳入口：单窗口（无 desktop 的 quick-add 双窗口路由）。
 * boot 装配见 App.tsx；Engine / Event Stream / 键盘避让都在登录前装好。
 */
async function mount() {
  // Mobile version comes from tauri.conf.json (via Tauri), falling back
  // to the mobile package.json when not running under Tauri (e.g. vitest).
  try {
    setAppVersion(await getVersion());
  } catch {
    setAppVersion(pkg.version);
  }

  // Mobile auth-flow navigation: the App component re-renders on auth state
  // changes (no URL navigation to /login — the shell swaps views, same as
  // the desktop shell).
  const { setAuthFlowNavigation } = await import('@taskora/api');
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
        // 前台同步模型（issue 04）：回前台由 mobile-engine 的 pull 覆盖，
        // 回到前台时全量 refetch 会重现 foreground flash，与 desktop 同因禁用。
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  // Event Stream 单例（登录后连接、登出断开）。前台期间它既是 UI 缓存的
  // 提示通道，也提示 mobile-engine 拉增量（ADR-0007）；后台断开由
  // 浏览器连接超时自然处理，不引入 FCM（spec 明确不做）。
  const { initEventStream, initBlobUploads, setAttachmentOpener } = await import('@taskora/api');
  initEventStream(queryClient);
  // 附件（ADR-0019）：登录后续传上次没传完的文件。
  initBlobUploads();
  // Android WebView 不处理 blob: 下载：附件交给 attachments 插件，写入缓存
  // 目录后由系统里能打开该类型的应用打开（task-attachments issue 06）。
  const { androidAttachmentOpener } = await import('./android-attachment-opener');
  setAttachmentOpener(androidAttachmentOpener);

  // Local-first Engine（完全体，ADR-0007）：登录后全部实体读写切换到本地
  // 副本（Tauri 侧 SQLite），同步走前台触发模型（启动 / 写后 / 回前台 /
  // 下拉刷新，见 engine/mobile-engine.ts）。
  const { initMobileEngine } = await import('./engine/mobile-engine');
  initMobileEngine(queryClient);

  // Reminders（reminders spec）：注册通知薄壳，UI 提醒区据此获得授权
  // 状态与跳转系统设置能力（web 前端不注册 → 提醒区隐藏）。
  const { setNotificationShell } = await import('@taskora/api');
  const { createMobileNotificationShell } = await import('./reminders/tauri-notification-shell');
  setNotificationShell(createMobileNotificationShell());

  // 状态栏常驻通知（android-status-bar，滴答清单形态）：折叠态单行
  // ongoing 通知 + 「>」轮播 + 「+」通知内快速添加；登录后随 Engine
  // 变更刷新。
  const { initStatusBar } = await import('./status-bar');
  initStatusBar();

  // 键盘避让（issue 05）：visualViewport → --kb-inset CSS 变量。
  installKeyboardInset();

  // 系统栏安全区：原生 WindowInsets → --native-safe-* CSS 变量（env() 兜底）。
  void installSafeAreaInsets();
  // 系统栏图标明暗跟随 App 主题（edge-to-edge 下系统栏透明）。
  installSystemBarAppearance();
  // WebView 的媒体查询可能停留在启动主题，原生负责系统切换 / 回前台同步。
  await installSystemTheme();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        {/* 原生窗口装饰：App 直接铺满视口（h-dvh），返回手势级联见 back-navigation.ts。 */}
        <App />
        {/* 顶部 toast 让出状态栏：sonner 默认偏移（手机 16px / 平板 24px）+ 安全区。 */}
        <Toaster
          richColors
          position="top-center"
          offset={{ top: 'calc(24px + var(--safe-area-top))' }}
          mobileOffset={{ top: 'calc(16px + var(--safe-area-top))' }}
        />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void mount();
