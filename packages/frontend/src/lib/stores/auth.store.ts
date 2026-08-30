import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AuthResponseDto } from '@taskora/shared';

export type AuthUser = AuthResponseDto['user'];

/** Strip the `preferences` field from a user object (auth snapshot hygiene). */
function omitPreferences(user: AuthUser): Omit<AuthUser, 'preferences'> {
  const { preferences, ...rest } = user;
  void preferences;
  return rest;
}

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
      // Persist the user snapshot for session recovery, but strip the
      // `preferences` field — preferences live in the unified preferences
      // store (`taskora-preferences`) and are re-hydrated from the server
      // during recovery. Keeping a copy here left a stale duplicate.
      partialize: (state) => ({
        user: state.user ? omitPreferences(state.user) : null,
      }),
    },
  ),
);
