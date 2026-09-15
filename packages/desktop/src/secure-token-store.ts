/** Native secure session storage: DPAPI file on Windows, keychain elsewhere. */
import { i18n, type TokenStore } from '@taskora/api';

interface Tokens {
  token: string | null;
  refreshToken: string | null;
}

export interface SecureTokenStore extends TokenStore {
  hydrate(): Promise<boolean>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  }
}

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  if (!window.__TAURI_INTERNALS__) throw new Error('Tauri internals unavailable');
  return window.__TAURI_INTERNALS__.invoke(cmd, args) as Promise<T>;
}

export function createSecureTokenStore(serverUrl: string): SecureTokenStore {
  let memory: Tokens = { token: null, refreshToken: null };
  let pending: Tokens | null = null;
  // Serialize writes even if a consumer does not await the previous operation.
  let writes: Promise<void> = Promise.resolve();

  async function save(update: Tokens | ((current: Tokens) => Tokens)): Promise<void> {
    const write = writes.then(async () => {
      const tokens = typeof update === 'function' ? update(pending ?? memory) : update;
      try {
        await invoke('session_write', { serverUrl, tokens });
        memory = tokens;
        pending = null;
      } catch {
        pending = tokens;
        throw new Error(i18n.t('auth:sessionSaveFailed'));
      }
    });
    writes = write.catch(() => undefined);
    return write;
  }

  const store: SecureTokenStore = {
    get: () => memory.token,
    getRefreshToken: () => memory.refreshToken,
    set: (token) => save((current) => ({ ...current, token })),
    setRefreshToken: (refreshToken) => save((current) => ({ ...current, refreshToken })),
    setTokens: (token, refreshToken) => save({ token, refreshToken }),
    async hydrate() {
      await writes;
      // Retry an uncommitted rotation before reading the now-stale disk pair.
      if (pending) await save(pending);
      try {
        memory = await invoke<Tokens>('session_read', { serverUrl });
        return !!(memory.token || memory.refreshToken);
      } catch {
        // A locked/corrupt store is not a signed-out session. Keep the file
        // and let the startup screen offer retry instead of overwriting it.
        throw new Error(i18n.t('auth:sessionReadFailed'));
      }
    },
    async withSessionLock(operation, options) {
      // Web Locks coordinate the main and quick-add webviews (same origin).
      // Reload inside the lock so another window's rotated token is visible.
      return navigator.locks.request('taskora-session', async () => {
        if (options?.reload !== false) await store.hydrate();
        return operation();
      });
    },
  };
  return store;
}
