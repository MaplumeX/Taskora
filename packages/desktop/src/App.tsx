import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, withSessionLock } from '@taskora/api';
import { Button } from '@taskora/ui/components/ui/button';
import { bootDesktop, resetDesktopSession } from './boot';
import { ServerSetup } from './ServerSetup';
import { Login } from './Login';
import { MainApp } from './MainApp';
import { useServerSettings } from './server-settings';

/**
 * Desktop app bootstrap: server setup → login → main window.
 *
 * Startup restores the session once through bootDesktop; this component
 * routes between setup, login and the main window.
 */
export function App() {
  const serverUrl = useServerSettings((s) => s.serverUrl);
  const setServerUrl = useServerSettings((s) => s.setServerUrl);

  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const refreshing = useAuthStore((s) => s.refreshing);

  const [readyServer, setReadyServer] = useState<string | null | undefined>(undefined);
  const onReady = useCallback(() => setReadyServer(serverUrl), [serverUrl]);

  if (readyServer !== serverUrl) {
    return <Boot key={serverUrl ?? ''} onReady={onReady} />;
  }

  if (!serverUrl) {
    return <ServerSetup />;
  }

  if (!token && !user) {
    return (
      <Login
        onBack={async () => {
          // Switching servers invalidates the stored session.
          await withSessionLock(() => useAuthStore.getState().clear());
          setServerUrl(null);
        }}
      />
    );
  }

  // Silent refresh in progress (startup recovery) — wait for it. Only
  // when the session isn't hydrated yet: a mid-session refresh (token
  // expired while the window was unfocused) must not unmount MainApp,
  // which would reintroduce the whole-page refresh flash on resume.
  // A rejected 401 refresh clears the store and falls through to Login.
  if (refreshing && !user) return null;

  return <MainApp />;
}

/** Startup failures are retryable; they never masquerade as a fresh login. */
function Boot({ onReady }: { onReady: () => void }) {
  const { t } = useTranslation();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void bootDesktop().then(
      () => {
        if (!cancelled) onReady();
      },
      () => {
        if (!cancelled) setError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [onReady, attempt]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6">
      {error ? (
        <>
          <p role="alert" className="text-center text-sm text-muted-foreground">
            {t('auth:sessionRestoreFailed')}
          </p>
          <Button
            onClick={() => {
              setError(false);
              setAttempt((value) => value + 1);
            }}
          >
            {t('auth:retrySession')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setError(false);
              void resetDesktopSession()
                .then(() => {
                  setAttempt((value) => value + 1);
                })
                .catch(() => setError(true));
            }}
          >
            {t('auth:resetSession')}
          </Button>
        </>
      ) : (
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-transparent" />
      )}
    </div>
  );
}
