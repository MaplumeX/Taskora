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
  type AuthUser,
} from '@taskora/api';
import { createSecureTokenStore, type SecureTokenStore } from './secure-token-store';
import { getServerUrl } from './server-settings';

let bootServer: string | null | undefined;
let store: SecureTokenStore | null = null;
let bootPromise: Promise<void> | null = null;

/**
 * 离线重启支持：把 user 快照镜像到 WebView localStorage（与 web 端的
 * legacy 快照同思路；非敏感信息，token 仍在安全存储）。快照不含
 * preferences（auth hygiene，hydrateAuthSnapshot 同口径）。
 *
 * 无快照时，refresh 网络失败 → 启动错误页，Engine 无法启动（缺
 * userId 选副本库）——「离线全功能」在重启场景下失效。有快照时，
 * 网络失败用快照继续离线运行，401 仍走登出。
 */
const USER_SNAPSHOT_KEY = 'taskora.userSnapshot';

function readUserSnapshot(): Omit<AuthUser, 'preferences'> | null {
  try {
    const raw = globalThis.localStorage?.getItem(USER_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Omit<AuthUser, 'preferences'>;
    return typeof parsed?.id === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

let snapshotMirrored = false;

/** 订阅 auth store，把 user 快照镜像到 localStorage（登录/登出/改资料）。 */
function mirrorUserSnapshot(): void {
  if (snapshotMirrored) return;
  snapshotMirrored = true;
  let lastJson: string | null = null;
  useAuthStore.subscribe((state) => {
    const user = state.user;
    const json = user
      ? JSON.stringify({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        })
      : null;
    if (json === lastJson) return;
    lastJson = json;
    if (json) globalThis.localStorage?.setItem(USER_SNAPSHOT_KEY, json);
    else globalThis.localStorage?.removeItem(USER_SNAPSHOT_KEY);
  });
}

/** Shared across StrictMode effect replays and component re-renders. */
export function bootDesktop(): Promise<void> {
  const serverUrl = getServerUrl();
  if (!bootPromise || bootServer !== serverUrl) {
    if (bootServer !== serverUrl) store = serverUrl ? createSecureTokenStore(serverUrl) : null;
    bootServer = serverUrl;
    bootPromise = (async () => {
      applyThemeFromStorage();
      setClientKind('desktop');
      mirrorUserSnapshot();
      if (!serverUrl) return;
      setApiBaseUrl(serverUrl);
      if (!store) return;
      configureTokenStore(store);
      if (!(await store.hydrate())) return;
      hydrateAuthSnapshot(readUserSnapshot());
      try {
        const data = await refresh();
        hydrateFromServer(data.user.preferences ?? null);
      } catch (error) {
        // Only a rejected refresh means sign-out (401 clears the session;
        // the snapshot mirror removes the stale user on the same store
        // transition). Network failures keep the hydrated snapshot user:
        // the local-first Engine runs fully offline, and the sync indicator
        // shows offline state. Without a snapshot (never signed in on this
        // machine) there is nothing to fall back to — surface the retry
        // screen as before.
        if ((error as { response?: { status?: number } }).response?.status !== 401) {
          if (!useAuthStore.getState().user) throw error;
        }
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
