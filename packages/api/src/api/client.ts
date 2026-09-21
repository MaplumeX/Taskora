import axios from 'axios';
import type { AuthResponseDto } from '@taskora/shared';

import { useAuthStore } from '@/stores/auth.store';
import { getTokenStore, readRefreshToken } from '@/token-store';

/**
 * Axios instance shared by all API modules.
 *
 * - `baseURL` is overridable per platform (web reads VITE_API_URL at
 *   startup; desktop points it at the configured self-hosted server).
 * - The access token is injected from the configured `TokenStore`
 *   (localStorage on web, native secure storage on desktop).
 * - Desktop additionally sends `X-Client: desktop` so the server returns
 *   the rotating refresh token in the response body instead of a cookie
 *   (the Tauri webview is cross-origin to the server, so cookies can't
 *   carry it).
 */
export const apiClient = axios.create({
  baseURL: 'http://localhost:3000/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

/** Point the client at another server (desktop: configured base URL). */
export function setApiBaseUrl(url: string): void {
  apiClient.defaults.baseURL = url;
}

/** Client kind reported to the server via the `X-Client` header. */
export type ClientKind = 'web' | 'desktop' | 'mobile';

let clientKind: ClientKind = 'web';

/**
 * Declare the client kind. Desktop and mobile must call this (once, at boot)
 * so the backend uses the body-based refresh-token flow instead of cookies.
 */
export function setClientKind(kind: ClientKind): void {
  clientKind = kind;
  if (kind !== 'web') {
    apiClient.defaults.headers['X-Client'] = kind;
  } else {
    delete apiClient.defaults.headers['X-Client'];
  }
}

/** Current client kind ('web' until the host opts into the desktop flow). */
export function getClientKind(): ClientKind {
  return clientKind;
}

/** Body for refresh requests: stored token on desktop, empty on web. */
function refreshRequestBody(): { refreshToken?: string } {
  const refreshToken = readRefreshToken();
  return refreshToken ? { refreshToken } : {};
}

/** Called when the refresh flow fails; the host navigates to login. */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

apiClient.interceptors.request.use((config) => {
  const token = getTokenStore().get() ?? useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Every caller (startup, explicit refresh, 401 recovery) shares one promise.
// A rejected promise also settles all waiting requests; no orphaned queue.
let refreshPromise: Promise<AuthResponseDto> | null = null;

export function refreshSession(): Promise<AuthResponseDto> {
  if (!refreshPromise) {
    const operation = async () => {
      useAuthStore.getState().setRefreshing(true);
      try {
        const { data } = await apiClient.post<AuthResponseDto>(
          '/auth/refresh',
          refreshRequestBody(),
          { timeout: 15_000 },
        );
        // Commit rotating credentials before exposing the new session.
        await useAuthStore.getState().setAuth(data.accessToken, data.user, data.refreshToken);
        return data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          await useAuthStore.getState().clear();
          onUnauthorized?.();
        }
        throw error;
      } finally {
        useAuthStore.getState().setRefreshing(false);
      }
    };
    const store = getTokenStore();
    refreshPromise = (
      store.withSessionLock ? store.withSessionLock(operation) : operation()
    ).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

    // Auth endpoints must not recurse into refresh. A wrong login password
    // is not evidence that an existing session has expired.
    if (
      error?.response?.status !== 401 ||
      !original ||
      original._retry ||
      ['/auth/refresh', '/auth/login', '/auth/register', '/auth/logout'].includes(
        original.url ?? '',
      )
    ) {
      return Promise.reject(error);
    }

    await refreshSession();
    original._retry = true;
    return apiClient(original);
  },
);
