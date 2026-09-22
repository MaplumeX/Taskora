import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, withSessionLock } from '@taskora/api';
import { Button } from '@taskora/ui/components/ui/button';
import { bootMobile, resetMobileSession } from './boot';
import { useBackNavigation } from './back-navigation';
import { ServerSetup } from './ServerSetup';
import { Login } from './Login';
import { MainApp } from './MainApp';
import { useServerSettings } from './server-settings';

/**
 * Android 壳 bootstrap: server setup → login → main window.
 *
 * Startup restores the session once through bootMobile; this component
 * routes between setup, login and the main window. Mirrors the desktop
 * App.tsx, with the mobile back-navigation cascade installed at the root.
 */
export function App() {
  const serverUrl = useServerSettings((s) => s.serverUrl);
  const setServerUrl = useServerSettings((s) => s.setServerUrl);

  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const refreshing = useAuthStore((s) => s.refreshing);

  // Android 返回手势级联（issue 05）：关闭抽屉/弹层 → 路由返回 → 根页退出。
  useBackNavigation();

  const [readyServer, setReadyServer] = useState<string | null | undefined>(undefined);
  const onReady = useCallback(() => setReadyServer(serverUrl), [serverUrl]);

  if (readyServer !== serverUrl) {
    return <Boot key={serverUrl ?? ''} onReady={onReady} />;
  }

  if (!serverUrl) {
    return <ServerSetup />;
  }

  if (refreshing) return null;

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

  return <MainApp />;
}

function Boot({ onReady }: { onReady: () => void }) {
  const { t } = useTranslation();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void bootMobile().then(
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
              void resetMobileSession()
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
