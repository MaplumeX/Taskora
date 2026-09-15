import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSecureTokenStore } from './secure-token-store';

let invoke: ReturnType<typeof vi.fn>;

beforeEach(() => {
  invoke = vi.fn();
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: { invoke } });
  let tail = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: vi.fn((_name: string, operation: () => Promise<unknown>) => {
        const next = tail.then(operation);
        tail = next.then(
          () => undefined,
          () => undefined,
        );
        return next;
      }),
    },
  });
});

afterEach(() => {
  delete window.__TAURI_INTERNALS__;
  vi.restoreAllMocks();
});

describe('secure session storage', () => {
  it('commits the token pair together and waits for persistence', async () => {
    let finish!: () => void;
    invoke.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const store = createSecureTokenStore('server-a');
    const pending = store.setTokens!('at', 'rt');
    expect(store.get()).toBeNull();
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('session_write', {
        serverUrl: 'server-a',
        tokens: { token: 'at', refreshToken: 'rt' },
      }),
    );
    finish();
    await pending;
    expect(store.get()).toBe('at');
    expect(store.getRefreshToken!()).toBe('rt');
  });

  it('does not report a failed write as a successful login', async () => {
    invoke.mockRejectedValueOnce(new Error('disk full'));
    const store = createSecureTokenStore('server');
    await expect(store.setTokens!('at', 'rt')).rejects.toThrow();
    expect(store.get()).toBeNull();
    invoke.mockResolvedValueOnce(undefined);
    await store.setTokens!('retry-at', 'retry-rt');
    expect(store.get()).toBe('retry-at');
  });

  it('serializes rotation and logout so the last write wins', async () => {
    const disk: unknown[] = [];
    invoke.mockImplementation(async (_command, args) => {
      disk.push(args.tokens);
    });
    const store = createSecureTokenStore('server');
    await Promise.all([store.setTokens!('at', 'rt'), store.setTokens!(null, null)]);
    expect(disk).toEqual([
      { token: 'at', refreshToken: 'rt' },
      { token: null, refreshToken: null },
    ]);
    expect(store.get()).toBeNull();
  });

  it('restores a refresh-token-only session in a newly created store', async () => {
    invoke.mockResolvedValue({ token: null, refreshToken: 'rt' });
    const store = createSecureTokenStore('server');
    expect(await store.hydrate()).toBe(true);
    expect(store.getRefreshToken!()).toBe('rt');
    expect(invoke).toHaveBeenCalledWith('session_read', { serverUrl: 'server' });
  });

  it('surfaces read errors without clearing saved credentials', async () => {
    invoke.mockRejectedValue(new Error('cannot decrypt'));
    await expect(createSecureTokenStore('server').hydrate()).rejects.toThrow();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe('session_read');
  });

  it('reloads the rotated token inside a lock shared by both windows', async () => {
    let disk = { token: 'at', refreshToken: 'rt-1' };
    invoke.mockImplementation(async (command, args) => {
      if (command === 'session_read') return { ...disk };
      disk = args.tokens;
    });
    const main = createSecureTokenStore('server');
    const quickAdd = createSecureTokenStore('server');
    const seen: string[] = [];
    await Promise.all([
      main.withSessionLock!(async () => {
        seen.push(main.getRefreshToken!()!);
        await main.setTokens!('at-2', 'rt-2');
      }),
      quickAdd.withSessionLock!(async () => {
        seen.push(quickAdd.getRefreshToken!()!);
        await quickAdd.setTokens!('at-3', 'rt-3');
      }),
    ]);
    expect(seen).toEqual(['rt-1', 'rt-2']);
    expect(disk.refreshToken).toBe('rt-3');
  });
  it('retries a failed rotation write before reloading the obsolete disk token', async () => {
    let disk = { token: 'old-at', refreshToken: 'old-rt' };
    let fail = true;
    invoke.mockImplementation(async (command, args) => {
      if (command === 'session_read') return { ...disk };
      if (fail) throw new Error('disk unavailable');
      disk = args.tokens;
    });
    const store = createSecureTokenStore('server');
    await store.hydrate();
    await expect(store.setTokens!('new-at', 'new-rt')).rejects.toThrow();
    fail = false;
    await store.withSessionLock!(async () => {
      expect(store.getRefreshToken!()).toBe('new-rt');
    });
    expect(disk.refreshToken).toBe('new-rt');
  });

  it('preserves both fields when compatibility setters are queued together', async () => {
    invoke.mockResolvedValue(undefined);
    const store = createSecureTokenStore('server');
    await Promise.all([store.set('at'), store.setRefreshToken!('rt')]);
    expect(store.get()).toBe('at');
    expect(store.getRefreshToken!()).toBe('rt');
  });
  it('allows explicit reset without reading an undecryptable session', async () => {
    invoke.mockImplementation(async (command) => {
      if (command === 'session_read') throw new Error('cannot decrypt');
    });
    const store = createSecureTokenStore('server');
    await store.withSessionLock!(() => store.setTokens!(null, null), { reload: false });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('session_write', {
      serverUrl: 'server',
      tokens: { token: null, refreshToken: null },
    });
  });
});
