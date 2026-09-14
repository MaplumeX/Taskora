/**
 * Token storage abstraction.
 *
 * The web client persists its auth token via the zustand localStorage
 * persist middleware, while the desktop client stores it in the OS
 * keychain (Tauri command). Both implementations satisfy this minimal
 * interface and are injected into the API layer through
 * `<TokenProvider>` / `configureTokenStore`.
 */
import { createContext, useContext } from 'react';

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

const TokenStoreContext = createContext<TokenStore>(noopTokenStore);

/** React context provider for the ambient token store. */
export const TokenStoreProvider = TokenStoreContext.Provider;

/** Access the ambient token store (defaults to a no-op store). */
export function useTokenStore(): TokenStore {
  return useContext(TokenStoreContext);
}

let ambientTokenStore: TokenStore = noopTokenStore;

/**
 * Install the token store used by non-React call sites (the axios
 * interceptors, startup recovery). Must be called before any request.
 */
export function configureTokenStore(store: TokenStore): void {
  ambientTokenStore = store;
}

/** @internal — read the currently configured token store. */
export function getTokenStore(): TokenStore {
  return ambientTokenStore;
}
