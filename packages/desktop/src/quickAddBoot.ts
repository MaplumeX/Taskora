/** Reload when opening quick-add: the main window may have logged in or rotated. */
import {
  configureTokenStore,
  hydrateAuthSnapshot,
  setApiBaseUrl,
  setClientKind,
  useAuthStore,
} from '@taskora/api';
import { createSecureTokenStore, type SecureTokenStore } from './secure-token-store';
import { getServerUrl, useServerSettings } from './server-settings';

let store: SecureTokenStore | null = null;
let storedServer: string | null = null;

export async function bootQuickAdd(): Promise<void> {
  // The main window can change this persisted setting in its own webview.
  await useServerSettings.persist.rehydrate();
  setClientKind('desktop');
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    useAuthStore.setState({ token: null, user: null });
    return;
  }
  setApiBaseUrl(serverUrl);
  if (!store || storedServer !== serverUrl) {
    store = createSecureTokenStore(serverUrl);
    storedServer = serverUrl;
  }
  configureTokenStore(store);
  await store.hydrate();
  useAuthStore.setState({ token: null, user: null });
  hydrateAuthSnapshot(null);
}
