import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  hydrate: vi.fn(),
  configure: vi.fn(),
  preferences: vi.fn(),
  url: vi.fn(() => 'https://example.test/api/v1'),
}));
vi.mock('@taskora/api', () => ({
  applyThemeFromStorage: vi.fn(),
  configureTokenStore: mocks.configure,
  hydrateAuthSnapshot: vi.fn(),
  hydrateFromServer: mocks.preferences,
  refresh: mocks.refresh,
  setApiBaseUrl: vi.fn(),
  setClientKind: vi.fn(),
}));
vi.mock('./secure-token-store', () => ({
  createSecureTokenStore: () => ({ hydrate: mocks.hydrate }),
}));
vi.mock('./server-settings', () => ({ getServerUrl: mocks.url }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
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
