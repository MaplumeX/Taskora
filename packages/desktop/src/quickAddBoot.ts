/**
 * Quick-add window bootstrap: wires the shared i18n instance and the data
 * layer (token store + API base URL) for the independent quick-add webview.
 */
import {
  configureTokenStore,
  hydrateAuthSnapshot,
  setApiBaseUrl,
  setClientKind,
} from '@taskora/api';
import { createKeyringTokenStore, hydrateKeyringToken } from './keyring-token-store';
import { getServerUrl } from './server-settings';

let ready: Promise<void> | null = null;

/** One-time async wiring for the quick-add webview context. */
export function bootQuickAdd(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      configureTokenStore(createKeyringTokenStore());
      setClientKind('desktop');
      const serverUrl = getServerUrl();
      if (serverUrl) {
        setApiBaseUrl(serverUrl);
        const token = await hydrateKeyringToken();
        if (token) hydrateAuthSnapshot(null);
      }
      // Importing '@taskora/api' already initialized i18n (side effect).
    })();
  }
  return ready;
}
