import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * 回归测试（desktop #45 同源问题在 mobile 的复活路径）：
 *
 * Android 后台冻结 JS 定时器且 mobile 无周期同步（前台触发模型），
 * 后台超过 access token TTL（15 分钟）后回前台，首个同步请求 401 →
 * axios 拦截器 refreshSession() 置 refreshing=true。若 App 在「会话已
 * 恢复」时也因 refreshing 卸载 MainApp，整个页面（路由、滚动、展开
 * 状态）会重挂载——即桌面端已修掉的前台整页刷新。
 *
 * 口径与 web 前端 ProtectedRoute 一致：仅 refreshing && !user 时等待。
 */

let authState: { token: string | null; user: unknown; refreshing: boolean } = {
  token: 'token-1',
  user: { id: 'u1', email: 'u@x.io' },
  refreshing: false,
};

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthStore: (selector?: (s: unknown) => unknown) =>
    selector ? selector(authState) : authState,
}));

vi.mock('./boot', () => ({
  bootMobile: vi.fn().mockResolvedValue(undefined),
  resetMobileSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./server-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./server-settings')>()),
  useServerSettings: (selector?: (s: { serverUrl: string | null }) => unknown) =>
    selector
      ? selector({ serverUrl: 'https://taskora.example.com/api/v1' })
      : { serverUrl: 'https://taskora.example.com/api/v1' },
}));

vi.mock('./MainApp', () => ({
  MainApp: () => <div>main-app-stub</div>,
}));

vi.mock('./back-navigation', () => ({
  useBackNavigation: vi.fn(),
}));

import { App } from './App';

describe('App (android shell) — mid-session silent refresh', () => {
  it('keeps MainApp mounted while a silent refresh runs with a restored session', async () => {
    const { rerender } = render(<App />);

    // Boot 完成 → MainApp 挂载
    await waitFor(() => {
      expect(screen.getByText('main-app-stub')).toBeInTheDocument();
    });

    // 回前台 token 过期：拦截器触发 refreshSession() → refreshing=true，
    // 但 token/user 仍在（refresh 提交前不清空）→ MainApp 不得卸载
    authState = { ...authState, refreshing: true };
    rerender(<App />);
    expect(screen.getByText('main-app-stub')).toBeInTheDocument();

    // refresh 完成回落 → 仍渲染主界面
    authState = { ...authState, refreshing: false };
    rerender(<App />);
    expect(screen.getByText('main-app-stub')).toBeInTheDocument();
  });

  it('still waits on refresh when the session is not hydrated yet (startup recovery)', async () => {
    authState = { token: 'token-1', user: null, refreshing: true };
    const { rerender } = render(<App />);

    // Boot 放行（bootMobile 已 resolve、onReady 已 setState），但 user
    // 尚未随 refresh 回来 → 不闪主界面，也不闪登录页（等待恢复完成）
    await act(async () => {
      await vi.mocked(await import('./boot')).bootMobile();
    });
    rerender(<App />);
    expect(screen.queryByText('main-app-stub')).not.toBeInTheDocument();

    authState = { ...authState, user: { id: 'u1' }, refreshing: false };
    rerender(<App />);
    await waitFor(() => {
      expect(screen.getByText('main-app-stub')).toBeInTheDocument();
    });
  });
});
