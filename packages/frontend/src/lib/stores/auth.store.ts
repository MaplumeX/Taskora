import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AuthResponseDto } from '@taskora/shared';

export type AuthUser = AuthResponseDto['user'];

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clear: () => set({ token: null, user: null }),
    }),
    {
      name: 'taskora-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);