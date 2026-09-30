import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

/**
 * 冷启动首屏：UI 在 Engine 装配完成前已经渲染，首屏查询走的是 REST
 * （离线失败、在线缺本地未推送的编辑）。装配后必须立即改从本地副本
 * 读（进入响应式查询模式），不能等首次同步——没有远端变更时同步根本
 * 不会触发 onChange。
 */

const authState = { token: 'token-1', user: { id: 'u1' } };

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@taskora/api')>()),
  useAuthStore: Object.assign(() => authState, {
    subscribe: () => () => undefined,
    getState: () => authState,
  }),
}));

const fakeEngine = {
  // 同步请求一直挂着：模拟冷启动时网络慢或断网
  sync: vi.fn(() => new Promise<undefined>(() => undefined)),
  cursor: vi.fn(async () => 1),
  pendingCount: vi.fn(async () => 0),
  close: vi.fn(async () => undefined),
  list: vi.fn(async () => []),
  onChange: vi.fn(() => () => undefined),
};

vi.mock('@taskora/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@taskora/engine')>()),
  openEngine: vi.fn(async () => fakeEngine),
}));

vi.mock('./tauri-storage', () => ({
  isTauriRuntime: () => true,
  useUserReplicaDb: vi.fn(async () => undefined),
  createTauriSqlStorage: () => ({}),
}));

vi.mock('./http-transport', () => ({
  createHttpSyncTransport: () => ({}),
  registerDevice: vi.fn(async () => undefined),
}));

vi.mock('../reminders/tauri-notification-shell', () => ({
  createDesktopNotificationShell: () => ({}),
  onReminderAction: vi.fn(async () => () => undefined),
}));

describe('desktop-engine 冷启动首屏', () => {
  it('Engine 装配后立即改从本地副本重读，不等同步完成（网络挂起/离线）', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { isLiveQueryMode } = await import('@taskora/api');
    const { initDesktopEngine } = await import('./desktop-engine');

    initDesktopEngine(queryClient);

    // 界面读改由 Engine 的响应式查询提供（local-first-v3 issue 06）：装配完
    // 即切换，此时同步仍未返回
    await vi.waitFor(() => expect(isLiveQueryMode()).toBe(true));
    expect(fakeEngine.sync).toHaveBeenCalledTimes(1);
  });
});
