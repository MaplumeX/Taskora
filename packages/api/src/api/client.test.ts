import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosAdapter, type AxiosRequestConfig } from 'axios';

import { apiClient, setClientKind, refreshSession, setUnauthorizedHandler } from '@/api/client';
import { configureTokenStore, type TokenStore } from '@/token-store';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Refresh-flow tests for the two transports:
 * - web: empty refresh body, token arrives via cookie (not asserted here)
 * - desktop: keychain refresh token in the body, rotated token in the
 *   response body gets persisted back to the store.
 */
function memoryTokenStore(tokens: {
  token?: string | null;
  refreshToken?: string | null;
}): TokenStore {
  let token = tokens.token ?? null;
  let refreshToken = tokens.refreshToken ?? null;
  return {
    get: () => token,
    set: (t) => {
      token = t;
    },
    getRefreshToken: () => refreshToken,
    setRefreshToken: (rt) => {
      refreshToken = rt;
    },
  };
}

/** Scripted axios adapter: replies in order, recording each request. */
function scriptedAdapter(...replies: Array<{ status: number; data?: unknown }>) {
  const seen: Array<AxiosRequestConfig & { data?: unknown }> = [];
  const adapter: AxiosAdapter = async (config) => {
    seen.push(config as never);
    const reply = replies[Math.min(seen.length - 1, replies.length - 1)];
    const response = {
      data: reply.data ?? {},
      status: reply.status,
      statusText: String(reply.status),
      headers: {},
      config,
    };
    // Mimic axios `settle`: non-2xx statuses reject so response
    // interceptors see them as errors.
    if (reply.status >= 200 && reply.status < 300) {
      return response as never;
    }
    throw new AxiosError(
      'Request failed',
      AxiosError.ERR_BAD_RESPONSE,
      config as never,
      undefined,
      response as never,
    );
  };
  return { seen, adapter };
}

describe('api client — refresh token transports', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setUnauthorizedHandler(null);
  });

  afterEach(async () => {
    setClientKind('web');
    setUnauthorizedHandler(null);
    await useAuthStore.getState().clear();
    configureTokenStore({
      get: () => null,
      set: () => undefined,
    });
  });

  it('desktop: sends the keychain refresh token in the body and persists the rotated one', async () => {
    const store = memoryTokenStore({ token: 'stale-at', refreshToken: 'rt-1' });
    configureTokenStore(store);
    setClientKind('desktop');

    const { seen, adapter } = scriptedAdapter(
      { status: 401 }, // initial request rejected
      {
        status: 200,
        data: { accessToken: 'at-2', refreshToken: 'rt-2', user: { id: 'u', preferences: null } },
      }, // refresh
      { status: 200, data: { ok: true } }, // retried original
    );
    apiClient.defaults.adapter = adapter;

    const res = await apiClient.get('/tasks');
    expect(res.status).toBe(200);

    // Original request carried the (stale) access token + client header.
    expect(seen[0].headers?.Authorization).toBe('Bearer stale-at');
    expect(seen[0].headers?.['X-Client']).toBe('desktop');
    // Refresh request carried the keychain refresh token in the body.
    expect(seen[1].url).toContain('/auth/refresh');
    expect(JSON.parse(seen[1].data as string)).toEqual({ refreshToken: 'rt-1' });
    // Retry used the fresh access token.
    expect(seen[2].headers?.Authorization).toBe('Bearer at-2');

    // Both rotated tokens were persisted.
    expect(store.get()).toBe('at-2');
    expect(store.getRefreshToken?.()).toBe('rt-2');
    expect(useAuthStore.getState().token).toBe('at-2');
  });

  it('web: sends an empty refresh body (cookie flow)', async () => {
    const store = memoryTokenStore({ token: 'stale-at' });
    configureTokenStore(store);
    setClientKind('web');

    const { seen, adapter } = scriptedAdapter(
      { status: 401 },
      { status: 200, data: { accessToken: 'at-2', user: { id: 'u', preferences: null } } },
      { status: 200, data: { ok: true } },
    );
    apiClient.defaults.adapter = adapter;

    const res = await apiClient.get('/tasks');
    expect(res.status).toBe(200);

    expect(seen[0].headers?.['X-Client']).toBeUndefined();
    expect(seen[1].url).toContain('/auth/refresh');
    expect(JSON.parse(seen[1].data as string)).toEqual({});
    expect(store.get()).toBe('at-2');
  });

  it('desktop: a rejected refresh clears both stored tokens', async () => {
    const store = memoryTokenStore({ token: 'stale-at', refreshToken: 'rt-bad' });
    configureTokenStore(store);
    setClientKind('desktop');
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    const { adapter } = scriptedAdapter(
      { status: 401 },
      { status: 401 }, // refresh itself fails
    );
    apiClient.defaults.adapter = adapter;

    await expect(apiClient.get('/tasks')).rejects.toMatchObject({ response: { status: 401 } });

    expect(store.get()).toBeNull();
    expect(store.getRefreshToken?.()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBeNull();
  });
  it.each([0, 500, 503])('keeps credentials on transient refresh failure (%s)', async (status) => {
    const store = memoryTokenStore({ token: 'at', refreshToken: 'rt' });
    configureTokenStore(store);
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    apiClient.defaults.adapter = scriptedAdapter({ status: 401 }, { status }).adapter;
    await expect(apiClient.get('/tasks')).rejects.toBeDefined();
    expect(store.get()).toBe('at');
    expect(store.getRefreshToken?.()).toBe('rt');
    expect(unauthorized).not.toHaveBeenCalled();
    expect(useAuthStore.getState().refreshing).toBe(false);
  });

  it.each([AxiosError.ERR_NETWORK, AxiosError.ECONNABORTED])(
    'keeps credentials on startup transport failure (%s) and permits a later refresh',
    async (code) => {
      const store = memoryTokenStore({ token: 'at', refreshToken: 'rt' });
      configureTokenStore(store);
      apiClient.defaults.adapter = async (config) => {
        throw new AxiosError('Network Error', code, config);
      };
      await expect(refreshSession()).rejects.toThrow('Network Error');
      expect(store.getRefreshToken?.()).toBe('rt');
      apiClient.defaults.adapter = scriptedAdapter({
        status: 200,
        data: {
          accessToken: 'at-2',
          refreshToken: 'rt-2',
          user: { id: 'user' },
        },
      }).adapter;
      await refreshSession();
      expect(store.getRefreshToken?.()).toBe('rt-2');
    },
  );

  it.each([401, 503])('settles all concurrent requests when refresh fails (%s)', async (status) => {
    configureTokenStore(memoryTokenStore({ token: 'at', refreshToken: 'rt' }));
    let rejectRefresh!: () => void;
    let refreshCount = 0;
    apiClient.defaults.adapter = async (config) => {
      const response = { data: {}, status: 401, statusText: '', headers: {}, config };
      if (config.url === '/auth/refresh') {
        refreshCount++;
        await new Promise<void>((_resolve, reject) => {
          rejectRefresh = () =>
            reject(
              new AxiosError('refresh failed', undefined, config, undefined, {
                ...response,
                status,
              }),
            );
        });
      }
      throw new AxiosError('unauthorized', undefined, config, undefined, response);
    };
    const settled = Promise.allSettled([apiClient.get('/tasks'), apiClient.get('/projects')]);
    await vi.waitFor(() => expect(refreshCount).toBe(1));
    rejectRefresh();
    expect((await settled).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(refreshCount).toBe(1);
  });

  it('does not finish login before native persistence succeeds', async () => {
    let commit!: () => void;
    const save = new Promise<void>((resolve) => {
      commit = resolve;
    });
    configureTokenStore({ ...memoryTokenStore({}), setTokens: () => save });
    const user = { id: 'user' } as Parameters<
      ReturnType<typeof useAuthStore.getState>['setAuth']
    >[1];
    const pending = useAuthStore.getState().setAuth('at', user, 'rt');
    expect(useAuthStore.getState().token).toBeNull();
    commit();
    await pending;
    expect(useAuthStore.getState().token).toBe('at');
  });

  it('surfaces persistence failure without presenting a successful login', async () => {
    configureTokenStore({
      ...memoryTokenStore({}),
      setTokens: vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined),
    });
    const user = { id: 'user' } as Parameters<
      ReturnType<typeof useAuthStore.getState>['setAuth']
    >[1];
    await expect(useAuthStore.getState().setAuth('at', user, 'rt')).rejects.toThrow('disk full');
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('does not attempt refresh or delete credentials for a wrong login password', async () => {
    const store = memoryTokenStore({ token: 'at', refreshToken: 'rt' });
    configureTokenStore(store);
    const { seen, adapter } = scriptedAdapter({ status: 401 });
    apiClient.defaults.adapter = adapter;
    await expect(apiClient.post('/auth/login', {})).rejects.toBeDefined();
    expect(seen).toHaveLength(1);
    expect(store.getRefreshToken?.()).toBe('rt');
  });
});
