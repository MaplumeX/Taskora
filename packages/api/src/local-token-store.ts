import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * localStorage-backed token store for the web client.
 *
 * Stores only the access token (the refresh token lives in an HttpOnly
 * cookie). Zustand persist is used purely for its storage plumbing so
 * the entry stays JSON-encoded like the previous `taskora-auth` snapshot.
 */
const TOKEN_KEY = 'taskora-auth-token';

function readToken(): string | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: unknown } };
    return typeof parsed?.state?.token === 'string' ? parsed.state.token : null;
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token === null) {
      window.localStorage.removeItem(TOKEN_KEY);
    } else {
      window.localStorage.setItem(
        TOKEN_KEY,
        JSON.stringify({ state: { token }, version: 0 }),
      );
    }
  } catch {
    // storage unavailable (private mode etc.) — session-only fallback
  }
}

export interface LocalTokenStoreState {
  token: string | null;
  setToken: (token: string | null) => void;
}

/** Zustand store mirroring the persisted token (for reactive consumers). */
export const useLocalTokenStore = create<LocalTokenStoreState>()(
  persist(
    (set) => ({
      token: null,
      setToken: (token: string | null) => set({ token }),
    }),
    {
      name: TOKEN_KEY,
      partialize: (state) => ({ token: state.token }),
      merge: (persisted, current) => ({
        ...current,
        token: (persisted as { token?: string | null } | undefined)?.token ?? null,
      }),
    },
  ),
);

/**
 * TokenStore implementation backed by localStorage.
 * Falls back to in-memory until first `get()` rehydrates it.
 */
export function createLocalTokenStore() {
  let cached: string | null | undefined;
  return {
    get(): string | null {
      if (cached === undefined) cached = readToken();
      return cached;
    },
    set(token: string | null): void {
      cached = token;
      writeToken(token);
      useLocalTokenStore.getState().setToken(token);
    },
  };
}

/** Legacy key holding the pre-split persisted auth snapshot (user only). */
const LEGACY_AUTH_KEY = 'taskora-auth';
const LEGACY_TOKEN_KEY = 'taskora-auth-token';

/** Migrated legacy snapshot shape (old `taskora-auth` persist entry). */
export interface LegacyAuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface LegacyAuthSnapshot {
  user?: LegacyAuthUser | null;
}

/**
 * Read the user snapshot persisted by the pre-split auth store so
 * existing web sessions survive the upgrade. The legacy entry itself
 * is removed once read (the token now lives in `taskora-auth-token`).
 */
export function readLegacyAuthSnapshot(): LegacyAuthUser | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { user?: LegacyAuthSnapshot['user'] } };
    const user = parsed?.state?.user ?? null;
    window.localStorage.removeItem(LEGACY_AUTH_KEY);
    return user;
  } catch {
    return null;
  }
}

/** Remove the token entry (logout / account deletion). */
export function clearLocalToken(): void {
  try {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    // ignore
  }
}
