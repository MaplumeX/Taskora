import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AuthResponseDto } from '@taskora/shared';

export type AuthUser = AuthResponseDto['user'];

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  refreshing: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  setToken: (token: string) => void;
  setUser: (user: AuthUser) => void;
  setRefreshing: (refreshing: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      refreshing: false,
      setAuth: (token, user) => set({ token, user }),
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      setRefreshing: (refreshing) => set({ refreshing }),
      clear: () => set({ token: null, user: null, refreshing: false }),
    }),
    {
      name: 'taskora-auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
