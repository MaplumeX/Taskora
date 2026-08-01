import axios from 'axios';

import { useAuthStore } from '@/lib/stores/auth.store';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
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
        waitingQueue.forEach((cb) => cb());
        waitingQueue = [];
        original._retry = true;
        return apiClient(original);
      } catch {
        useAuthStore.getState().clear();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
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
