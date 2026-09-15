import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@taskora/api', () => ({
  getMe: vi.fn(),
  refresh: vi.fn(),
  hydrateFromServer: vi.fn(),
  useAuthStore: { getState: vi.fn() },
}));

import { getMe, hydrateFromServer, refresh, useAuthStore } from '@taskora/api';
import { tryRecoverSession } from './sessionRecovery';

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
});

describe('tryRecoverSession', () => {
  it('recovers the user via /auth/me when only the token survived the reload', async () => {
    mockAuthState({ token: 'stored-token', user: null });

    vi.mocked(getMe).mockResolvedValue(meResponse as never);

    await tryRecoverSession();

    expect(getMe).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(setUser).toHaveBeenCalledWith(meResponse);
    expect(hydrateFromServer).toHaveBeenCalledWith(meResponse.preferences);
    expect(setRefreshing).toHaveBeenNthCalledWith(1, true);
    expect(setRefreshing).toHaveBeenLastCalledWith(false);
  });

  it('silently refreshes when a legacy user snapshot exists without a token', async () => {
    mockAuthState({ token: null, user: { id: 'u1', email: 'a@b.c' } as never });

    vi.mocked(refresh).mockResolvedValue(authResponse as never);

    await tryRecoverSession();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(getMe).not.toHaveBeenCalled();
    expect(hydrateFromServer).toHaveBeenCalledWith(authResponse.user.preferences);
    expect(setRefreshing).toHaveBeenNthCalledWith(1, true);
    expect(setRefreshing).toHaveBeenLastCalledWith(false);
  });

  it('does nothing when the session is fully hydrated (token + user)', async () => {
    mockAuthState({ token: 't', user: { id: 'u1' } as never });

    await tryRecoverSession();

    expect(getMe).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(setRefreshing).not.toHaveBeenCalled();
  });

  it('does nothing when signed out (no token, no user)', async () => {
    mockAuthState({ token: null, user: null });

    await tryRecoverSession();

    expect(getMe).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(setRefreshing).not.toHaveBeenCalled();
  });

  it('resets the refreshing flag and keeps credentials on transient failures', async () => {
    mockAuthState({ token: 'stored-token', user: null });

    vi.mocked(getMe).mockRejectedValue(new Error('network down'));

    await expect(tryRecoverSession()).resolves.toBeUndefined();

    expect(setUser).not.toHaveBeenCalled();
    expect(hydrateFromServer).not.toHaveBeenCalled();
    expect(setRefreshing).toHaveBeenLastCalledWith(false);
  });
});
