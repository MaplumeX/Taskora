import { useEffect, useState } from 'react';

import {
  applyThemeFromStorage,
  configureTokenStore,
  hydrateAuthSnapshot,
  refresh,
  setApiBaseUrl,
  useAuthStore,
  hydrateFromServer,
} from '@taskora/api';
import { ServerSetup } from './ServerSetup';
import { Login } from './Login';
import { MainApp } from './MainApp';
import { createKeyringTokenStore, hydrateKeyringToken } from './keyring-token-store';
import { getServerUrl, useServerSettings } from './server-settings';

/**
 * Desktop app bootstrap: server setup → login → main window.
 *
 * The heavy work (keychain hydration, token store wiring, API base URL)
 * happens once in main.tsx before React mounts; this component only
 * routes between the three top-level states.
 */
export function App() {
  const [booted, setBooted] = useState(false);
  const serverUrl = useServerSettings((s) => s.serverUrl);
  const setServerUrl = useServerSettings((s) => s.setServerUrl);

  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const refreshing = useAuthStore((s) => s.refreshing);

  // Re-apply the API base URL whenever the server setting changes.
  useEffect(() => {
    if (serverUrl) setApiBaseUrl(serverUrl);
  }, [serverUrl]);

  if (!booted) {
    return (
      <Boot onReady={() => setBooted(true)} />
    );
  }

  if (!serverUrl) {
    return <ServerSetup />;
  }

  if (!token && !user) {
    return (
      <Login
        onBack={() => {
          // Switching servers invalidates the stored session.
          useAuthStore.getState().clear();
          setServerUrl(null);
        }}
      />
    );
  }

  // Silent refresh in progress (startup recovery) — wait for it.
  if (refreshing) return null;

  return <MainApp />;
}

/**
 * One-time async boot: hydrate the keychain token, wire the API base URL
 * and attempt a silent session refresh before first paint decisions.
 */
function Boot({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      configureTokenStore(createKeyringTokenStore());
      const serverUrl = getServerUrl();
      if (serverUrl) {
        setApiBaseUrl(serverUrl);
        const token = await hydrateKeyringToken();
        if (token) {
          hydrateAuthSnapshot(null);
          // Try to refresh the access token (rotating refresh cookie).
          // A 401 means the refresh token is genuinely rejected → real
          // logout. Network errors are transient: keep the keychain token
          // so the user stays signed in across restarts (issue 03).
          const { setAuth, clear, setRefreshing } = useAuthStore.getState();
          setRefreshing(true);
          try {
            const data = await refresh();
            if (cancelled) return;
            setAuth(data.accessToken, data.user);
            hydrateFromServer(data.user.preferences ?? null);
          } catch (err) {
            const status = (err as { response?: { status?: number } })?.response
              ?.status;
            if (!cancelled && status === 401) clear();
          } finally {
            if (!cancelled) setRefreshing(false);
          }
        }
      }
      if (!cancelled) {
        applyThemeFromStorage();
        onReady();
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [onReady]);

  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-transparent" />
    </div>
  );
}
