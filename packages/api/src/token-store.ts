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
