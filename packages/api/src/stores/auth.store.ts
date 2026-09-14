import { create } from 'zustand';

import type { AuthResponseDto } from '@taskora/shared';

import { getTokenStore } from '@/token-store';
export type AuthUser = AuthResponseDto['user'];

/** Strip the `preferences` field from a user object (auth snapshot hygiene). */
function omitPreferences(user: AuthUser): Omit<AuthUser, 'preferences'> {
  const { preferences, ...rest } = user;
  void preferences;
  return rest;
}

/**
 * In-memory auth state shared by every client. The access token is
 * additionally persisted through the configured `TokenStore`
 * (localStorage on web, OS keychain on desktop) by `setAuth`/`setToken`/
 * `clear`; this store itself never persists (see issue 01/03).
 */
interface AuthState {
  token: string | null;
  user: AuthUser | null;
  refreshing: boolean;
  setAuth: (token: string, user: AuthUser, refreshToken?: string) => void;
  setToken: (token: string) => void;
  setUser: (user: AuthUser) => void;
  setRefreshing: (refreshing: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,
  refreshing: false,
  setAuth: (token, user, refreshToken) => {
    getTokenStore().set(token);
    // Desktop login responses carry the refresh token in the body; persist
    // it when provided (web keeps it in the HttpOnly cookie instead).
    if (refreshToken !== undefined) getTokenStore().setRefreshToken?.(refreshToken);
    set({ token, user });
  },
  setToken: (token) => {
    getTokenStore().set(token);
    set({ token });
  },
  setUser: (user) => set({ user }),
  setRefreshing: (refreshing) => set({ refreshing }),
  clear: () => {
    getTokenStore().set(null);
    getTokenStore().setRefreshToken?.(null);
    set({ token: null, user: null, refreshing: false });
  },
}));

/**
 * Hydrate the in-memory store from a token store + persisted user
 * snapshot (web: zustand localStorage snapshot; desktop: keychain user
 * metadata). Called once at startup before any request fires.
 * `preferences` is optional — snapshots never persist it (auth hygiene).
 */
export function hydrateAuthSnapshot(
  user: (AuthUser | Omit<AuthUser, 'preferences'>) | null,
): void {
  const token = getTokenStore().get();
  if (!token) return;
  useAuthStore.setState({ token, user: (user ? omitPreferences(user as AuthUser) : null) as AuthUser | null });
}
