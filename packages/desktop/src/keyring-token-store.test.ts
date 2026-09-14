import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureTokenStore, noopTokenStore } from '@taskora/api';
import { createKeyringTokenStore, hydrateKeyringToken } from './keyring-token-store';

/** The real tauriInvoke reads window.__TAURI_INTERNALS__ — mock that. */
function mockTauriInvoke() {
  const handler = vi.fn();
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: { invoke: handler },
  });
  return handler;
}

describe('keyring token store', () => {
  let invoke: ReturnType<typeof mockTauriInvoke>;

  beforeEach(() => {
    invoke = mockTauriInvoke();
    configureTokenStore(noopTokenStore);
  });

  afterEach(() => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('persists tokens to the keychain via the Tauri command', () => {
    invoke.mockResolvedValue(null);
    const store = createKeyringTokenStore();
    store.set('token-1');
    expect(invoke).toHaveBeenCalledWith('keyring_set_token', { token: 'token-1' });
    // In-memory read is synchronous.
    expect(store.get()).toBe('token-1');
  });

  it('clears the keychain when set(null)', () => {
    invoke.mockResolvedValue(null);
    const store = createKeyringTokenStore();
    store.set('token-1');
    store.set(null);
    expect(invoke).toHaveBeenLastCalledWith('keyring_set_token', { token: null });
    expect(store.get()).toBeNull();
  });

  it('survives keychain write failures without crashing', () => {
    invoke.mockRejectedValueOnce(new Error('locked'));
    const store = createKeyringTokenStore();
    expect(() => store.set('token-2')).not.toThrow();
    expect(store.get()).toBe('token-2');
  });

  it('hydrateKeyringToken reads from the keychain into memory', async () => {
    invoke.mockResolvedValueOnce('restored-token');
    const token = await hydrateKeyringToken();
    expect(invoke).toHaveBeenCalledWith('keyring_get_token', undefined);
    expect(token).toBe('restored-token');
    // Subsequent synchronous gets see the hydrated value.
    expect(createKeyringTokenStore().get()).toBe('restored-token');
  });

  it('falls back to null when the keychain read fails', async () => {
    invoke.mockRejectedValueOnce(new Error('no keyring'));
    const token = await hydrateKeyringToken();
    expect(token).toBeNull();
  });

  it('falls back to null when Tauri internals are missing', async () => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    const token = await hydrateKeyringToken();
    expect(token).toBeNull();
  });
});
