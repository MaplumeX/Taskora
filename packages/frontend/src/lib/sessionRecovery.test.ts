import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@taskora/api', () => ({
  authKeys: { me: ['auth', 'me'] },
  getMe: vi.fn(),
  refresh: vi.fn(),
  hydrateFromServer: vi.fn(),
  useAuthStore: { getState: vi.fn() },
}));

import { authKeys, getMe, hydrateFromServer, refresh, useAuthStore } from '@taskora/api';
import { tryRecoverSession } from './sessionRecovery';

let queryClient: QueryClient;
const setRefreshing = vi.fn();
const setUser = vi.fn();

function mockAuthState(state: { token: string | null; user: object | null }): void {
  vi.mocked(useAuthStore.getState).mockReturnValue({
    ...state,
    setRefreshing,
    setUser,
  } as never);
}

const meResponse = {
  id: 'u1',
  email: 'a@b.c',
  displayName: 'Ada',
  avatarUrl: null,
  preferences: { theme: 'dark' },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const authResponse = {
  accessToken: 'new-token',
  user: { ...meResponse, preferences: { theme: 'light' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false } },
  });
});

describe('tryRecoverSession', () => {
  it('recovers the user via /auth/me when only the token survived the reload', async () => {
    mockAuthState({ token: 'stored-token', user: null });

    vi.mocked(getMe).mockResolvedValue(meResponse as never);

    await tryRecoverSession(queryClient);

    expect(getMe).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(setUser).toHaveBeenCalledWith(meResponse);
    expect(hydrateFromServer).toHaveBeenCalledWith(meResponse.preferences);
    expect(setRefreshing).toHaveBeenNthCalledWith(1, true);
    expect(setRefreshing).toHaveBeenLastCalledWith(false);
  });

  it('shares the verified user with the first UI query before exposing the session', async () => {
    mockAuthState({ token: 'stored-token', user: null });
    vi.mocked(getMe).mockResolvedValue(meResponse as never);
    setUser.mockImplementationOnce(() => {
      expect(queryClient.getQueryData(authKeys.me)).toEqual(meResponse);
    });

    await tryRecoverSession(queryClient);
    // 与界面相同的 key / staleTime：启动后的查询命中缓存，不再请求 /auth/me。
    const user = await queryClient.fetchQuery({ queryKey: authKeys.me, queryFn: getMe });
    expect(user).toEqual(meResponse);
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('shares an in-flight recovery request if the UI mounts while a token is being refreshed', async () => {
    mockAuthState({ token: 'stored-token', user: null });
    let resolveMe!: (value: typeof meResponse) => void;
    vi.mocked(getMe).mockReturnValue(
      new Promise((resolve) => {
        resolveMe = resolve;
      }) as never,
    );

    const recovery = tryRecoverSession(queryClient);
    const uiQuery = queryClient.fetchQuery({ queryKey: authKeys.me, queryFn: getMe });
    expect(getMe).toHaveBeenCalledTimes(1);
    resolveMe(meResponse);
    await recovery;
    expect(await uiQuery).toEqual(meResponse);
  });

  it('verifies the current identity even when an earlier user exists in the query cache', async () => {
    mockAuthState({ token: 'stored-token', user: null });
    queryClient.setQueryData(authKeys.me, { ...meResponse, id: 'previous-account' });
    vi.mocked(getMe).mockResolvedValue(meResponse as never);

    await tryRecoverSession(queryClient);
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(setUser).toHaveBeenCalledWith(meResponse);
  });

  it('silently refreshes when a legacy user snapshot exists without a token', async () => {
    mockAuthState({ token: null, user: { id: 'u1', email: 'a@b.c' } as never });

    vi.mocked(refresh).mockResolvedValue(authResponse as never);

    await tryRecoverSession(queryClient);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(getMe).not.toHaveBeenCalled();
    expect(hydrateFromServer).toHaveBeenCalledWith(authResponse.user.preferences);
    expect(setRefreshing).toHaveBeenNthCalledWith(1, true);
    expect(setRefreshing).toHaveBeenLastCalledWith(false);
  });

  it('does nothing when the session is fully hydrated (token + user)', async () => {
    mockAuthState({ token: 't', user: { id: 'u1' } as never });

    await tryRecoverSession(queryClient);

    expect(getMe).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(setRefreshing).not.toHaveBeenCalled();
  });

  it('does nothing when signed out (no token, no user)', async () => {
    mockAuthState({ token: null, user: null });

    await tryRecoverSession(queryClient);

    expect(getMe).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(setRefreshing).not.toHaveBeenCalled();
  });

  it('resets the refreshing flag and keeps credentials on transient failures', async () => {
    mockAuthState({ token: 'stored-token', user: null });

    vi.mocked(getMe).mockRejectedValue(new Error('network down'));

    await expect(tryRecoverSession(queryClient)).resolves.toBeUndefined();

    expect(setUser).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(authKeys.me)).toBeUndefined();
    expect(hydrateFromServer).not.toHaveBeenCalled();
    expect(setRefreshing).toHaveBeenLastCalledWith(false);
  });
});
