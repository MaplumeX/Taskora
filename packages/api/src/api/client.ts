import axios from 'axios';

import { useAuthStore } from '@/stores/auth.store';
import { getTokenStore } from '@/token-store';

/**
 * Axios instance shared by all API modules.
 *
 * - `baseURL` is overridable per platform (web reads VITE_API_URL at
 *   startup; desktop points it at the configured self-hosted server).
 * - The access token is injected from the configured `TokenStore`
 *   (localStorage on web, OS keychain on desktop).
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

let isRefreshing = false;
let waitingQueue: Array<() => void> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as
      | (typeof error.config & { _retry?: boolean })
      | undefined;

    // Refresh endpoint itself returned 401 → clear and reject (no infinite loop)
    if (original?.url?.includes('/auth/refresh')) {
      useAuthStore.getState().clear();
      getTokenStore().set(null);
      return Promise.reject(error);
    }

    if (
      error?.response?.status !== 401 ||
      !original ||
      original._retry
    ) {
      return Promise.reject(error);
    }

    if (!isRefreshing) {
      isRefreshing = true;
      useAuthStore.getState().setRefreshing(true);
      try {
        const { accessToken } = await apiClient
          .post('/auth/refresh')
          .then((res) => res.data as { accessToken: string });
        useAuthStore.getState().setToken(accessToken);
        getTokenStore().set(accessToken);
        waitingQueue.forEach((cb) => cb());
        waitingQueue = [];
        original._retry = true;
        return apiClient(original);
      } catch {
        useAuthStore.getState().clear();
        getTokenStore().set(null);
        onUnauthorized?.();
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
        useAuthStore.getState().setRefreshing(false);
      }
    } else {
      return new Promise((resolve) => {
        waitingQueue.push(() => {
          original._retry = true;
          resolve(apiClient(original));
        });
      });
    }
  },
);
