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

  // 无条件刷新等待只保留给「会话尚未恢复」的场景（与 web 端
  // ProtectedRoute 的 refreshing && !user 同口径）：会话已在时，后台
  // 超过 token TTL（15 分钟）后回前台，首个同步请求会触发静默
  // refreshSession，若在此期间卸载 MainApp 会让整个页面重挂载——
  // 这正是 desktop #45 已修掉的前台刷新问题在 mobile 的复活路径。
  // refresh 失败（401）时 store 会被 clear，下方自然会切到 Login。
  if (refreshing && !user) return null;

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
