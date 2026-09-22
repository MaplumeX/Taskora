/**
 * Native session storage: 应用私有目录明文 JSON（ADR-0011，android-app
 * issue 03）。
 *
 * 落盘住在 Rust 侧（src-tauri/src/session.rs）：
 * - `session_read { serverUrl }`：读取（无会话返回空）；
 * - `session_write { serverUrl, tokens }`：原子写入；
 * - `session_clear`：登出删除会话文件。
 *
 * ADR-0009 的 Android Keystore JNI 桥在真机登录时崩溃（无法定位根因，
 * 无真机日志），ADR-0011 采纳明文降级：未 root 设备仍受 Linux 沙箱
 * 保护，root/备份提取面前明文裸奔（已知取舍）。
 *
 * 对齐 desktop 的注入模式与内存/在飞写串行语义（见 desktop
 * secure-token-store.ts；差异仅是后端从 DPAPI 换成应用私有目录文件，
 * 以及单 WebView 壳不再需要跨窗口 Web Locks）。
 */
import { i18n, type TokenStore } from '@taskora/api';

interface Tokens {
  token: string | null;
  refreshToken: string | null;
}

export interface SecureTokenStore extends TokenStore {
  /** 原子写入令牌对（桌面/移动端都会实现；web 端留空）。 */
  setTokens(token: string | null, refreshToken: string | null): Promise<void>;
  hydrate(): Promise<boolean>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  }
}

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  if (!window.__TAURI_INTERNALS__) throw new Error('Tauri internals unavailable');
  return window.__TAURI_INTERNALS__.invoke(cmd, args) as Promise<T>;
}

export function createSecureTokenStore(serverUrl: string): SecureTokenStore {
  let memory: Tokens = { token: null, refreshToken: null };
  let pending: Tokens | null = null;
  // Serialize writes even if a consumer does not await the previous operation.
  let writes: Promise<void> = Promise.resolve();

  async function save(update: Tokens | ((current: Tokens) => Tokens)): Promise<void> {
    const write = writes.then(async () => {
      const tokens = typeof update === 'function' ? update(pending ?? memory) : update;
      try {
        if (!tokens.token && !tokens.refreshToken) {
          // 登出：清除密文与 Keystore 密钥引用（issue 03 验收）。
          // Android 壳无 legacy 会话可防回流（desktop 的 tombstone 语义
          // 针对其 keychain 迁移），彻底清除即可。
          await invoke('session_clear', {});
        } else {
          await invoke('session_write', { serverUrl, tokens });
        }
        memory = tokens;
        pending = null;
      } catch {
        pending = tokens;
        throw new Error(i18n.t('auth:sessionSaveFailed'));
      }
    });
    writes = write.catch(() => undefined);
    return write;
  }

  const store: SecureTokenStore = {
    get: () => memory.token,
    getRefreshToken: () => memory.refreshToken,
    set: (token) => save((current) => ({ ...current, token })),
    setRefreshToken: (refreshToken) => save((current) => ({ ...current, refreshToken })),
    setTokens: (token, refreshToken) => save({ token, refreshToken }),
    async hydrate() {
      await writes;
      // Retry an uncommitted rotation before reading the now-stale disk pair.
      if (pending) await save(pending);
      try {
        memory = await invoke<Tokens>('session_read', { serverUrl });
        return !!(memory.token || memory.refreshToken);
      } catch {
        // A locked/corrupt store is not a signed-out session. Keep the file
        // and let the startup screen offer retry instead of overwriting it.
        throw new Error(i18n.t('auth:sessionReadFailed'));
      }
    },
    async withSessionLock(operation, options) {
      // Android 壳是单 WebView：无 quick-add 第二窗口，无跨窗口竞争，
      // 锁退化为先 hydrate 再执行（保留 desktop 的语义接口）。
      if (options?.reload !== false) await store.hydrate();
      return operation();
    },
  };
  return store;
}
