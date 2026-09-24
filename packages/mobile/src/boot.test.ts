import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  hydrate: vi.fn(),
  configure: vi.fn(),
  preferences: vi.fn(),
  url: vi.fn(() => 'https://example.test/api/v1'),
  hydrateSnapshot: vi.fn(),
  subscribe: vi.fn(),
  authState: {
    user: null as ({ id: string; email?: string } | null),
    token: null as string | null,
  },
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
    getState: () => ({ user: mocks.authState.user, token: mocks.authState.token }),
  },
  withSessionLock: vi.fn(),
}));
vi.mock('./secure-token-store', () => ({
  createSecureTokenStore: () => ({ hydrate: mocks.hydrate }),
}));
vi.mock('./server-settings', () => ({ getServerUrl: mocks.url }));

function stubLocalStorage(): Record<string, string> {
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
  return store;
}

const SNAPSHOT = { id: 'user-1', email: 'a@b.test', displayName: 'A', avatarUrl: null };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.authState.user = null;
  mocks.authState.token = null;
  mocks.hydrateSnapshot.mockImplementation((user: unknown) => {
    // 镜像真实 hydrateAuthSnapshot：有 token 才注入 store（token + user）。
    mocks.authState.user = (user as { id: string; email?: string } | null) ?? null;
    mocks.authState.token = mocks.authState.user ? 'access-token' : null;
  });
  mocks.hydrate.mockResolvedValue(true);
  mocks.refresh.mockResolvedValue({ user: { preferences: null } });
  mocks.url.mockReturnValue('https://example.test/api/v1');
});

describe('mobile boot', () => {
  it('shares one startup and rotation across effect replays and re-renders', async () => {
    const { bootMobile } = await import('./boot');
    const first = bootMobile();
    expect(bootMobile()).toBe(first);
    await first;
    await bootMobile();
    expect(mocks.hydrate).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes any saved session, including one without an access token', async () => {
    const { bootMobile } = await import('./boot');
    await bootMobile();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('allows retry after a transient startup failure', async () => {
    mocks.refresh.mockRejectedValueOnce(new Error('offline'));
    const { bootMobile } = await import('./boot');
    await expect(bootMobile()).rejects.toThrow('offline');
    await expect(bootMobile()).resolves.toBeUndefined();
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it('有快照：boot 不等 refresh —— refresh 在飞时 boot 已 resolve，成功后补 preferences（issue 07）', async () => {
    const store = stubLocalStorage();
    store['taskora.userSnapshot'] = JSON.stringify(SNAPSHOT);
    let resolveRefresh!: (value: { user: { preferences: { theme: string } | null } }) => void;
    mocks.refresh.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const { bootMobile } = await import('./boot');
    // 关键断言：服务器响应前 boot 已放行主界面（冷启动不再转圈等网络）。
    await expect(bootMobile()).resolves.toBeUndefined();
    expect(mocks.preferences).not.toHaveBeenCalled();

    resolveRefresh({ user: { preferences: { theme: 'dark' } } });
    await vi.waitFor(() => expect(mocks.preferences).toHaveBeenCalledWith({ theme: 'dark' }));
    vi.unstubAllGlobals();
  });

  it('有快照：后台 refresh 401 静默处理（不使 boot 失败，client.ts 既有路径切 Login）', async () => {
    const store = stubLocalStorage();
    store['taskora.userSnapshot'] = JSON.stringify(SNAPSHOT);
    mocks.refresh.mockRejectedValueOnce({ response: { status: 401 } });

    const { bootMobile } = await import('./boot');
    await expect(bootMobile()).resolves.toBeUndefined();
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.preferences).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('网络失败但有 user 快照：离线继续启动（快照注入 auth store，Engine 可用）', async () => {
    const store = stubLocalStorage();
    store['taskora.userSnapshot'] = JSON.stringify(SNAPSHOT);
    mocks.refresh.mockRejectedValueOnce(new Error('offline'));

    const { bootMobile } = await import('./boot');
    await expect(bootMobile()).resolves.toBeUndefined();
    expect(mocks.hydrateSnapshot).toHaveBeenCalledWith(SNAPSHOT);
    // refresh 未成功 → preferences 不从服务器拉取（本地存储兜底）
    expect(mocks.preferences).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('网络失败且无快照（从未登录）：维持可重试的启动错误', async () => {
    mocks.refresh.mockRejectedValueOnce(new Error('offline'));
    const { bootMobile } = await import('./boot');
    await expect(bootMobile()).rejects.toThrow('offline');
    expect(mocks.hydrateSnapshot).toHaveBeenCalledWith(null);
  });

  it('finishes at login only when refresh is rejected or no session exists', async () => {
    mocks.refresh.mockRejectedValueOnce({ response: { status: 401 } });
    const { bootMobile } = await import('./boot');
    await expect(bootMobile()).resolves.toBeUndefined();
  });

  it('does not refresh when signed out', async () => {
    mocks.hydrate.mockResolvedValue(false);
    const { bootMobile } = await import('./boot');
    await bootMobile();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('configures storage after the first server setup', async () => {
    mocks.url.mockReturnValue('');
    const { bootMobile } = await import('./boot');
    await bootMobile();
    expect(mocks.configure).not.toHaveBeenCalled();
    mocks.url.mockReturnValue('https://example.test/api/v1');
    await bootMobile();
    expect(mocks.configure).toHaveBeenCalledTimes(1);
  });
});
