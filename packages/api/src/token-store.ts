/**
 * Token storage abstraction.
 *
 * The web client persists its auth token via a localStorage store, while
 * the desktop client stores it in the OS keychain (Tauri command). Both
 * implementations satisfy this minimal interface and are injected into
 * the API layer via `configureTokenStore` before any request fires.
 */

export interface TokenStore {
  /** Read the persisted access token, if any. */
  get(): string | null;
  /** Persist (or clear, when null) the access token. */
  set(token: string | null): void;
  /**
   * Optional refresh-token persistence. Desktop implementations store the
   * rotating refresh token next to the access token (OS keychain) because
   * the webview cannot rely on cookies. The web store leaves these unset —
   * its refresh token lives in an HttpOnly cookie.
   */
  getRefreshToken?(): string | null;
  setRefreshToken?(refreshToken: string | null): void;
}

/** Read-through token store backed by nothing (default). */
export const noopTokenStore: TokenStore = {
  get: () => null,
  set: () => undefined,
};

let ambientTokenStore: TokenStore = noopTokenStore;

/**
 * Install the token store used by the axios interceptors and the auth
 * store's persistence hooks. Must be called before any request.
 */
export function configureTokenStore(store: TokenStore): void {
  ambientTokenStore = store;
}

/** @internal — read the currently configured token store. */
export function getTokenStore(): TokenStore {
  return ambientTokenStore;
}

/** @internal — read the persisted refresh token (null for cookie clients). */
export function readRefreshToken(): string | null {
  return ambientTokenStore.getRefreshToken?.() ?? null;
}

/** @internal — persist (or clear) the refresh token when the store supports it. */
export function writeRefreshToken(refreshToken: string | null): void {
  ambientTokenStore.setRefreshToken?.(refreshToken);
}
