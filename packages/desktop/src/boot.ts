import {
  applyThemeFromStorage,
  configureTokenStore,
  hydrateAuthSnapshot,
  hydrateFromServer,
  refresh,
  setApiBaseUrl,
  setClientKind,
  useAuthStore,
  withSessionLock,
} from '@taskora/api';
import { createSecureTokenStore, type SecureTokenStore } from './secure-token-store';
import { getServerUrl } from './server-settings';

let bootServer: string | null | undefined;
let store: SecureTokenStore | null = null;
let bootPromise: Promise<void> | null = null;

/** Shared across StrictMode effect replays and component re-renders. */
export function bootDesktop(): Promise<void> {
  const serverUrl = getServerUrl();
  if (!bootPromise || bootServer !== serverUrl) {
    if (bootServer !== serverUrl) store = serverUrl ? createSecureTokenStore(serverUrl) : null;
    bootServer = serverUrl;
    bootPromise = (async () => {
      applyThemeFromStorage();
      setClientKind('desktop');
      if (!serverUrl) return;
      setApiBaseUrl(serverUrl);
      if (!store) return;
      configureTokenStore(store);
      if (!(await store.hydrate())) return;
      hydrateAuthSnapshot(null);
      try {
        const data = await refresh();
        hydrateFromServer(data.user.preferences ?? null);
      } catch (error) {
        // Only a rejected refresh means sign-out. All other failures show
        // a retryable startup error, including refresh-token-only sessions.
        if ((error as { response?: { status?: number } }).response?.status !== 401) throw error;
      }
    })().catch((error) => {
      bootPromise = null;
      throw error;
    });
  }
  return bootPromise;
}

/** Explicit user recovery for an unreadable session; never runs automatically. */
export async function resetDesktopSession(): Promise<void> {
  await withSessionLock(() => useAuthStore.getState().clear(), { reload: false });
  bootPromise = null;
}
