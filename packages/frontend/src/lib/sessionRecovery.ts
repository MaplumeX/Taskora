import { getMe, hydrateFromServer, refresh, useAuthStore } from '@taskora/api';

/**
 * Startup session recovery for the web client.
 *
 * After a full page reload (e.g. the post-login `window.location.assign('/today')`)
 * the access token is restored from localStorage, but the user object lived only
 * in memory and is gone. Two recovery paths, both run before React renders so
 * ProtectedRoute can wait on `refreshing`:
 *
 * - token without user (standard web session): fetch `/auth/me` with the token.
 *   If the token has expired, the shared interceptor transparently refreshes
 *   via the HttpOnly cookie and retries.
 * - user snapshot without token (legacy upgrade only): silently refresh via
 *   the HttpOnly cookie.
 *
 * A fully hydrated session (token + user) or a signed-out one needs no work.
 */
export async function tryRecoverSession(): Promise<void> {
  const { user, token, setRefreshing, setUser } = useAuthStore.getState();

  if ((token && user) || (!token && !user)) return;

  setRefreshing(true);
  try {
    if (token) {
      const me = await getMe();
      setUser(me);
      hydrateFromServer(me.preferences ?? null);
    } else {
      const data = await refresh();
      hydrateFromServer(data.user.preferences ?? null);
    }
  } catch {
    // Rejected credentials are cleared by refresh()/the interceptor; transient
    // failures keep them and queries retry through react-query.
  } finally {
    setRefreshing(false);
  }
}
