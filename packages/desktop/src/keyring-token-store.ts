/**
 * OS-keychain-backed TokenStore for the desktop client.
 *
 * The actual keychain access lives in the Rust process (keyring crate),
 * exposed through the `keyring_get_token` / `keyring_set_token` Tauri
 * commands. The token never touches localStorage or any plaintext file.
 */
import type { TokenStore } from '@taskora/api';

interface TauriInvoke {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  }
}

/**
 * Thin wrapper around the Tauri IPC invoke that stays mockable in tests.
 * Reads the injected mock first, then the real Tauri internals.
 */
export const tauriInvoke: TauriInvoke = {
  invoke(cmd, args) {
    const internals = window.__TAURI_INTERNALS__;
    if (!internals) {
      return Promise.reject(new Error('Tauri internals unavailable'));
    }
    return internals.invoke(cmd, args) as Promise<unknown> as never;
  },
};

export function createKeyringTokenStore(): TokenStore {
  return {
    get() {
      // Synchronous interface contract: return the in-memory token; the
      // async keychain value is hydrated once at startup (see bootstrap).
      return memoryToken;
    },
    set(token) {
      memoryToken = token;
      // Fire-and-forget persistence; failures surface in the console.
      void tauriInvoke
        .invoke<string | null>('keyring_set_token', { token })
        .catch((err) => console.error('[keyring] persist failed:', err));
    },
  };
}

let memoryToken: string | null = null;

/** Hydrate the in-memory token from the OS keychain at startup. */
export async function hydrateKeyringToken(): Promise<string | null> {
  try {
    memoryToken = await tauriInvoke.invoke<string | null>('keyring_get_token');
  } catch (err) {
    console.error('[keyring] read failed:', err);
    memoryToken = null;
  }
  return memoryToken;
}
