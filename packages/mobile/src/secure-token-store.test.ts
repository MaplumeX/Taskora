import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TokenStore 抽象层 round-trip（issue 03）：
 * mock Rust command（session_read / session_write / session_clear），断言
 * 「加密落盘」的 TS 侧契约——加解密本身在 Rust/Keystore 侧，由
 * android-release.yml 的真机构建覆盖。
 */

interface Tokens {
  token: string | null;
  refreshToken: string | null;
}

let invoke: ReturnType<typeof vi.fn>;
/** mock 的「密文盘」：session_write 的最后一个参数。 */
let storedSessions: Array<{ serverUrl: string; tokens: Tokens }>;
let cleared: number;

beforeEach(() => {
  storedSessions = [];
  cleared = 0;
  invoke = vi.fn((cmd: string, args: Record<string, unknown>) => {
    switch (cmd) {
      case 'session_write':
        storedSessions.push(args as { serverUrl: string; tokens: Tokens });
        return Promise.resolve(undefined);
      case 'session_read': {
        const last = [...storedSessions]
          .reverse()
          .find((session) => session.serverUrl === args.serverUrl);
        return Promise.resolve(last ? last.tokens : { token: null, refreshToken: null });
      }
      case 'session_clear':
        cleared += 1;
        storedSessions = [];
        return Promise.resolve(undefined);
      default:
        return Promise.reject(new Error(`unexpected command: ${cmd}`));
    }
  });
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: { invoke },
  });
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

async function makeStore(serverUrl = 'https://example.com/api/v1') {
  const { createSecureTokenStore } = await import('./secure-token-store');
  return createSecureTokenStore(serverUrl);
}

describe('secure-token-store（Android Keystore 会话存储，issue 03）', () => {
  it('round-trip：登录写入的令牌在重启后恢复（内存 → 密文盘 → 内存）', async () => {
    const store = await makeStore();

    await store.setTokens('access-1', 'refresh-1');

    // 「重启」：全新 store 实例从盘上 hydrate
    const rebooted = await makeStore();
    expect(await rebooted.hydrate()).toBe(true);
    expect(rebooted.get()).toBe('access-1');
    expect(rebooted.getRefreshToken?.()).toBe('refresh-1');
  });

  it('未登录时 hydrate 返回 false', async () => {
    const store = await makeStore();
    expect(await store.hydrate()).toBe(false);
    expect(store.get()).toBeNull();
  });

  it('令牌旋转只落盘新值', async () => {
    const store = await makeStore();
    await store.setTokens('access-1', 'refresh-1');
    await store.setTokens('access-2', 'refresh-2');

    expect(storedSessions).toHaveLength(2);
    expect(storedSessions.at(-1)?.tokens).toEqual({ token: 'access-2', refreshToken: 'refresh-2' });
  });

  it('换服务器后 hydrate 不串号（server-bound）', async () => {
    const storeA = await makeStore('https://a.example.com/api/v1');
    await storeA.setTokens('a-access', 'a-refresh');

    const storeB = await makeStore('https://b.example.com/api/v1');
    expect(await storeB.hydrate()).toBe(false);
    expect(storeB.get()).toBeNull();
  });

  it('登出清除密文与密钥引用（session_clear，而非写空 tombstone）', async () => {
    const store = await makeStore();
    await store.setTokens('access-1', 'refresh-1');
    expect(storedSessions).toHaveLength(1);

    await store.setTokens(null, null);

    // 登出走 session_clear（连带清除 mock 盘），不再追加 session_write
    expect(cleared).toBe(1);
    expect(
      invoke.mock.calls.filter(([cmd]) => cmd === 'session_write'),
    ).toHaveLength(1);
    expect(await store.hydrate()).toBe(false);
  });

  it('单侧清空（token 过期但 refresh 存续）仍走 session_write 保留半边', async () => {
    const store = await makeStore();
    await store.setTokens('access-1', 'refresh-1');

    await store.set(null);

    expect(storedSessions).toHaveLength(2);
    expect(storedSessions.at(-1)?.tokens).toEqual({ token: null, refreshToken: 'refresh-1' });
    expect(cleared).toBe(0);
  });

  it('写入失败时挂起的旋转在下一次 save 重试（pending 语义）', async () => {
    const store = await makeStore();
    invoke.mockRejectedValueOnce(new Error('keystore unavailable'));

    await expect(store.setTokens('access-1', 'refresh-1')).rejects.toThrow();

    // 恢复后重新保存同一对令牌成功
    await store.setTokens('access-1', 'refresh-1');
    expect(storedSessions).toHaveLength(1);
    const rebooted = await makeStore();
    expect(await rebooted.hydrate()).toBe(true);
  });

  it('读取失败（密文损坏）不是已登出：hydrate 抛错而非静默清空', async () => {
    const store = await makeStore();
    invoke.mockRejectedValueOnce(new Error('keystore: GCM tag mismatch'));

    await expect(store.hydrate()).rejects.toThrow();
    expect(store.get()).toBeNull();
  });
});
