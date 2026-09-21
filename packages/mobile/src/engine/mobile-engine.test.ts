import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

/**
 * 前台同步四场景（issue 04 验收）：启动 pull、本地写后 push（防抖）、
 * 回前台 pull、下拉刷新 pull。断言全部针对外部可观察行为
 * （engine.sync 调用时机与 SyncIndicator 状态），不测实现细节。
 */

type AuthState = { token: string | null; user: { id: string } | null };
type AuthListener = (state: AuthState, prev: AuthState) => void;

const authState: AuthState = { token: 'token-1', user: { id: 'u1' } };
const authListeners = new Set<AuthListener>();

const fakeAuthStore = Object.assign(
  (selector?: (s: AuthState) => unknown) => (selector ? selector(authState) : authState),
  {
    subscribe: (listener: AuthListener) => {
      authListeners.add(listener);
      return () => authListeners.delete(listener);
    },
    getState: () => authState,
    setState: (patch: Partial<AuthState>) => {
      const prev = { ...authState };
      Object.assign(authState, patch);
      authListeners.forEach((listener) => listener({ ...authState }, prev));
    },
  },
);

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@taskora/api')>()),
  useAuthStore: fakeAuthStore,
}));

vi.mock('@taskora/engine', () => ({
  openEngine: vi.fn(async () => fakeEngine),
}));

vi.mock('./tauri-storage', async () => ({
  isTauriRuntime: () => true,
  useUserReplicaDb: vi.fn(async () => undefined),
  createTauriSqlStorage: () => ({}),
}));

type EngineOnChange = (change: { origin: string; entities?: [] }) => void;

const fakeEngine = {
  sync: vi.fn(async () => undefined),
  cursor: vi.fn(async () => 1),
  pendingCount: vi.fn(async () => 0),
  close: vi.fn(async () => undefined),
  onChange: vi.fn<(cb: EngineOnChange) => () => undefined>(),
};

let engineOnChange: EngineOnChange | null = null;
fakeEngine.onChange.mockImplementation((cb) => {
  engineOnChange = cb;
  return () => undefined;
});

async function loadEngine() {
  const mod = await import('./mobile-engine');
  return mod;
}

beforeEach(() => {
  vi.clearAllMocks();
  authListeners.clear();
  Object.assign(authState, { token: 'token-1', user: { id: 'u1' } });
  engineOnChange = null;
});

afterEach(async () => {
  const { __resetForTest } = await loadEngine();
  __resetForTest();
  Object.assign(authState, { token: null, user: null });
});

function renderQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('mobile-engine 前台同步触发（issue 04）', () => {
  it('场景 1 — 启动：Engine 装配后立即 pull（bootstrap/增量）', async () => {
    const { initMobileEngine } = await loadEngine();

    initMobileEngine(renderQueryClient());

    await vi.waitFor(() => {
      expect(fakeEngine.sync).toHaveBeenCalled();
    });
  });

  it('场景 2 — 本地写后防抖 push：连续写只触发一次 flush/pull', async () => {
    vi.useFakeTimers();
    try {
      const { initMobileEngine } = await loadEngine();
      initMobileEngine(renderQueryClient());

      await vi.waitFor(() => {
        expect(fakeEngine.sync).toHaveBeenCalledTimes(1);
      });
      expect(engineOnChange).toBeTruthy();

      // 连续三次本地写（地铁里快速录入）
      engineOnChange!({ origin: 'local' });
      engineOnChange!({ origin: 'local' });
      engineOnChange!({ origin: 'local' });

      // 防抖窗口内未触发
      await vi.advanceTimersByTimeAsync(500);
      expect(fakeEngine.sync).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(600);
      expect(fakeEngine.sync).toHaveBeenCalledTimes(2);

      // 远端写应用后不调度同步（无新 Outbox，再拉是空转）
      fakeEngine.sync.mockClear();
      engineOnChange!({ origin: 'remote' });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(fakeEngine.sync).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('场景 3 — 回前台 pull：visibilitychange 与 focus 都触发', async () => {
    const { initMobileEngine, __resetForTest } = await loadEngine();
    initMobileEngine(renderQueryClient());

    await vi.waitFor(() => {
      expect(fakeEngine.sync).toHaveBeenCalledTimes(1);
    });

    fakeEngine.sync.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => {
      expect(fakeEngine.sync).toHaveBeenCalled();
    });

    // 等待在飞 sync 收尾（并发去重依赖 syncInFlight 归零）
    await new Promise((resolve) => setTimeout(resolve, 10));
    fakeEngine.sync.mockClear();
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => {
      expect(fakeEngine.sync).toHaveBeenCalled();
    });
    __resetForTest();
  });

  it('场景 4 — 下拉刷新：requestPullSync 手动触发 pull，且在飞任务合并', async () => {
    const { initMobileEngine, requestPullSync } = await loadEngine();
    initMobileEngine(renderQueryClient());

    await vi.waitFor(() => {
      expect(fakeEngine.sync).toHaveBeenCalledTimes(1);
    });
    fakeEngine.sync.mockClear();

    // 两次手动触发并发合并为一个在飞 sync
    await Promise.all([requestPullSync(), requestPullSync()]);

    expect(fakeEngine.sync).toHaveBeenCalledTimes(1);
  });

  it('断网：sync 失败 → SyncIndicator 显示 offline + Outbox 排队数', async () => {
    const { useSyncStatusStore } = await import('@taskora/api');
    const { initMobileEngine } = await loadEngine();
    fakeEngine.sync.mockRejectedValueOnce(new Error('network'));
    fakeEngine.pendingCount.mockResolvedValueOnce(4);

    initMobileEngine(renderQueryClient());

    await vi.waitFor(() => {
      expect(useSyncStatusStore.getState().status).toBe('offline');
    });
    expect(useSyncStatusStore.getState().pendingCount).toBe(4);
  });

  it('登出：退回 REST 后端并关闭副本', async () => {
    const { initMobileEngine, getMobileEngine } = await loadEngine();
    initMobileEngine(renderQueryClient());

    await vi.waitFor(() => {
      expect(getMobileEngine()).toBeTruthy();
    });

    fakeAuthStore.setState({ token: null, user: null });

    await vi.waitFor(() => {
      expect(fakeEngine.close).toHaveBeenCalled();
    });
    expect(getMobileEngine()).toBeNull();
  });
});
