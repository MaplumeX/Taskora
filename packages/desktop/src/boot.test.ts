import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  hydrate: vi.fn(),
  configure: vi.fn(),
  preferences: vi.fn(),
  url: vi.fn(() => 'https://example.test/api/v1'),
  hydrateSnapshot: vi.fn(),
  subscribe: vi.fn(),
  authState: { user: null as ({ id: string; email?: string } | null) },
}));
vi.mock('@taskora/api', () => ({
  applyThemeFromStorage: vi.fn(),
  configureTokenStore: mocks.configure,
  hydrateAuthSnapshot: mocks.hydrateSnapshot,
  hydrateFromServer: mocks.preferences,
  refresh: mocks.refresh,
  setApiBaseUrl: vi.fn(),
  setClientKind: vi.fn(),
  useAuthStore: {
    subscribe: mocks.subscribe.mockImplementation((listener: () => void) => {
      void listener;
      return () => undefined;
    }),
    getState: () => ({ user: mocks.authState.user }),
  },
  withSessionLock: vi.fn(),
}));
vi.mock('./secure-token-store', () => ({
  createSecureTokenStore: () => ({ hydrate: mocks.hydrate }),
}));
vi.mock('./server-settings', () => ({ getServerUrl: mocks.url }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.authState.user = null;
  mocks.hydrateSnapshot.mockImplementation((user: unknown) => {
    mocks.authState.user = (user as { id: string; email?: string } | null) ?? null;
  });
  mocks.hydrate.mockResolvedValue(true);
  mocks.refresh.mockResolvedValue({ user: { preferences: null } });
  mocks.url.mockReturnValue('https://example.test/api/v1');
});

describe('desktop boot', () => {
  it('shares one startup and rotation across effect replays and re-renders', async () => {
    const { bootDesktop } = await import('./boot');
    const first = bootDesktop();
    expect(bootDesktop()).toBe(first);
    await first;
    await bootDesktop();
    expect(mocks.hydrate).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes any saved session, including one without an access token', async () => {
    const { bootDesktop } = await import('./boot');
    await bootDesktop();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('allows retry after a transient startup failure', async () => {
    mocks.refresh.mockRejectedValueOnce(new Error('offline'));
    const { bootDesktop } = await import('./boot');
    await expect(bootDesktop()).rejects.toThrow('offline');
    await expect(bootDesktop()).resolves.toBeUndefined();
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it('网络失败但有 user 快照：离线继续启动（快照注入 auth store，Engine 可用）', async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
    const snapshot = { id: 'user-1', email: 'a@b.test', displayName: 'A', avatarUrl: null };
    store['taskora.userSnapshot'] = JSON.stringify(snapshot);
    mocks.refresh.mockRejectedValueOnce(new Error('offline'));

    const { bootDesktop } = await import('./boot');
    await expect(bootDesktop()).resolves.toBeUndefined();
    expect(mocks.hydrateSnapshot).toHaveBeenCalledWith(snapshot);
    // refresh 未成功 → preferences 不从服务器拉取（本地存储兑底）
    expect(mocks.preferences).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('网络失败且无快照（从未登录）：维持可重试的启动错误', async () => {
    mocks.refresh.mockRejectedValueOnce(new Error('offline'));
    const { bootDesktop } = await import('./boot');
    await expect(bootDesktop()).rejects.toThrow('offline');
    expect(mocks.hydrateSnapshot).toHaveBeenCalledWith(null);
  });

  it('finishes at login only when refresh is rejected or no session exists', async () => {
    mocks.refresh.mockRejectedValueOnce({ response: { status: 401 } });
    const { bootDesktop } = await import('./boot');
    await expect(bootDesktop()).resolves.toBeUndefined();
  });

  it('does not refresh when signed out', async () => {
    mocks.hydrate.mockResolvedValue(false);
    const { bootDesktop } = await import('./boot');
    await bootDesktop();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('configures storage after the first server setup', async () => {
    mocks.url.mockReturnValue('');
    const { bootDesktop } = await import('./boot');
    await bootDesktop();
    expect(mocks.configure).not.toHaveBeenCalled();
    mocks.url.mockReturnValue('https://example.test/api/v1');
    await bootDesktop();
    expect(mocks.configure).toHaveBeenCalledTimes(1);
  });
});
