import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * 回归测试（#45 前台整页刷新的同源路径）：
 *
 * access token TTL 15 分钟；窗口失焦期间周期同步（30s）通常在后台就把
 * token 续掉，但若 15 分钟节点恰逢窗口不可见，回前台首个请求仍会 401 →
 * refreshSession() 置 refreshing=true。会话已恢复时若因此卸载 MainApp，
 * 等于把 #38/#45 已修掉的前台刷新又带回来。
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
  bootDesktop: vi.fn().mockResolvedValue(undefined),
  resetDesktopSession: vi.fn().mockResolvedValue(undefined),
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

import { App } from './App';

describe('App (desktop shell) — mid-session silent refresh', () => {
  it('keeps MainApp mounted while a silent refresh runs with a restored session', async () => {
    const { rerender } = render(<App />);

    // Boot 完成 → MainApp 挂载
    await waitFor(() => {
      expect(screen.getByText('main-app-stub')).toBeInTheDocument();
    });

    // 失焦期间 token 过期：拦截器触发 refreshSession() → refreshing=true，
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

    // Boot 放行（bootDesktop 已 resolve、onReady 已 setState），但 user
    // 尚未随 refresh 回来 → 不闪主界面，也不闪登录页（等待恢复完成）
    await act(async () => {
      await vi.mocked(await import('./boot')).bootDesktop();
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
