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

vi.mock('@taskora/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@taskora/engine')>()),
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
  // Reminders 协调器重算时拉任务列表（空列表 → 无通知注册）
  list: vi.fn(async () => [] as []),
  onChange: vi.fn<(cb: EngineOnChange) => () => boolean>(),
};

// 多订阅者语义（Reminders 协调器与同步调度都订阅 engine.onChange；
// mockImplementation 只能保留最后一个实现，会悄悄丢掉前者）。
const engineChangeListeners = new Set<EngineOnChange>();
fakeEngine.onChange.mockImplementation((cb) => {
  engineChangeListeners.add(cb);
  return () => engineChangeListeners.delete(cb);
});
const emitEngineChange: EngineOnChange = (change) => {
  for (const listener of engineChangeListeners) listener(change);
};

async function loadEngine() {
  const mod = await import('./mobile-engine');
  return mod;
}

beforeEach(() => {
  vi.clearAllMocks();
  authListeners.clear();
  Object.assign(authState, { token: 'token-1', user: { id: 'u1' } });
  engineChangeListeners.clear();
});

afterEach(async () => {
  const { __resetForTest } = await loadEngine();
  __resetForTest();
  Object.assign(authState, { token: null, user: null });
});

function renderQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('mobile-engine 冷启动首屏', () => {
  it('Engine 装配后立即改从本地副本重读，不等同步完成（网络挂起/离线）', async () => {
    // 同步请求一直挂着：模拟冷启动时网络慢或断网
    fakeEngine.sync.mockImplementationOnce(() => new Promise<undefined>(() => undefined));
    const queryClient = renderQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { initMobileEngine } = await loadEngine();

    initMobileEngine(queryClient);

    // 装配前 UI 已经用 REST 发起了首屏查询；注入 Engine 后必须全量失效，
    // 让 feed / 列表改从本地副本读——而此时同步仍未返回
    await vi.waitFor(() => {
      const roots = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
      expect(roots).toEqual(expect.arrayContaining(['["feed"]', '["tasks"]', '["projects"]']));
    });
    expect(fakeEngine.sync).toHaveBeenCalledTimes(1);
  });
});

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
      expect(engineChangeListeners.size).toBeGreaterThan(0);

      // 连续三次本地写（地铁里快速录入）
      emitEngineChange({ origin: 'local' });
      emitEngineChange({ origin: 'local' });
      emitEngineChange({ origin: 'local' });

      // 防抖窗口内未触发
      await vi.advanceTimersByTimeAsync(500);
      expect(fakeEngine.sync).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(600);
      expect(fakeEngine.sync).toHaveBeenCalledTimes(2);

      // 远端写应用后不调度同步（无新 Outbox，再拉是空转）
      fakeEngine.sync.mockClear();
      emitEngineChange({ origin: 'remote' });
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

  it('场景 4 — 下拉刷新：requestPullSync 手动触发 pull，在飞期间的触发合并为一次补跑', async () => {
    const { initMobileEngine, requestPullSync } = await loadEngine();
    initMobileEngine(renderQueryClient());

    await vi.waitFor(() => {
      expect(fakeEngine.sync).toHaveBeenCalledTimes(1);
    });
    fakeEngine.sync.mockClear();

    // 在飞期间的多次触发合并为一个在飞 sync + 结束后补跑一轮（期间可能
    // 有新的远端变更或本地写，不能等下个周期）
    await Promise.all([requestPullSync(), requestPullSync(), requestPullSync()]);
    await vi.waitFor(() => {
      expect(fakeEngine.sync).toHaveBeenCalledTimes(2);
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fakeEngine.sync).toHaveBeenCalledTimes(2);
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

  it('hub 要求升级（426）：显示升级提示，此后不再发起同步，Outbox 保留', async () => {
    const { useSyncStatusStore } = await import('@taskora/api');
    const { SyncUpgradeRequiredError } = await import('@taskora/engine');
    const { initMobileEngine, requestPullSync } = await loadEngine();
    fakeEngine.sync.mockRejectedValueOnce(new SyncUpgradeRequiredError(2));
    fakeEngine.pendingCount.mockResolvedValueOnce(3);

    initMobileEngine(renderQueryClient());

    await vi.waitFor(() => {
      expect(useSyncStatusStore.getState().status).toBe('upgrade-required');
    });
    expect(useSyncStatusStore.getState().pendingCount).toBe(3);
    const calls = fakeEngine.sync.mock.calls.length;
    await requestPullSync();
    expect(fakeEngine.sync).toHaveBeenCalledTimes(calls);
    expect(fakeEngine.close).not.toHaveBeenCalled(); // 本地读写照常
  });

  it('副本来自更新版本（降级安装）：不打开副本，退回 REST 并提示升级', async () => {
    const { useSyncStatusStore } = await import('@taskora/api');
    const engineModule = await import('@taskora/engine');
    vi.mocked(engineModule.openEngine).mockRejectedValueOnce(
      new engineModule.ReplicaSchemaTooNewError(9, 4),
    );
    const { initMobileEngine, getMobileEngine } = await loadEngine();

    initMobileEngine(renderQueryClient());

    await vi.waitFor(() => {
      expect(useSyncStatusStore.getState().status).toBe('upgrade-required');
    });
    expect(getMobileEngine()).toBeNull();
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
