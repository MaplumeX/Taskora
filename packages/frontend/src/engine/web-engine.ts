/**
 * web 端 Engine 装配与同步调度（local-first-v3 issue 05，ADR-0007）。
 *
 * 与桌面端同语义：登录后全部实体读写切到本地副本（hooks 零改动），写入
 * 进 Outbox、断网可用，由 Engine 与 Sync Hub 收敛。副本是 OPFS 里的
 * SQLite（sqlite.worker.ts），同一浏览器的多个标签页共用一份：
 *
 * - Web Locks 选 leader：leader 打开副本、持有唯一的 Engine / Outbox /
 *   HLC，跑同步循环（周期 + 聚焦 + 写后防抖 + SSE 提示）；
 * - 每个标签页的 UI 都经 TabEngine 读写（leader 本地执行，其余标签页经
 *   BroadcastChannel 转给 leader），leader 广播变更与同步状态；
 * - leader 标签页关闭，锁释放，排队的下一个标签页接任。
 *
 * 浏览器不支持（无 OPFS / Web Locks / Worker，如部分隐私模式）或副本
 * 打不开时，保持 REST 路径（第 1 步：REST 写同样经 hub 合并器）。
 * 登出：退回 REST，OPFS 里的副本保留（Outbox 未推的编辑属于用户数据）。
 */

import type { QueryClient } from '@tanstack/react-query';

import {
  createEngineAreaBackend,
  attachLiveQueries,
  detachLiveQueries,
  createEngineInvalidator,
  createEngineProjectBackend,
  createEngineProjectHeadingBackend,
  createEngineTagBackend,
  createEngineTaskBackend,
  createHttpSyncTransport,
  onRemoteChangeEvent,
  registerSyncDevice,
  setAreaBackend,
  setEventStreamCacheSurgery,
  setProjectBackend,
  setProjectHeadingBackend,
  setSyncStatus,
  setTagBackend,
  setTaskBackend,
  useAuthStore,
  type SyncStatus,
} from '@taskora/api';
import {
  openEngine,
  ReplicaSchemaTooNewError,
  SyncUpgradeRequiredError,
  type Engine,
} from '@taskora/engine';

import { createEngineHost, TabEngine, type TabChannel, type TabMessage } from './tab-engine';
import type { WorkerSqlStorage } from './worker-storage';
import { createBrowserStorageRuntime } from './browser-storage';

const DEVICE_ID_KEY = 'taskora.deviceId';
const SYNC_INTERVAL_MS = 30_000;

/** 运行时依赖（测试注入假实现）。 */
export interface WebEngineRuntime {
  locks: Pick<LockManager, 'request'>;
  createChannel(name: string): TabChannel & { close(): void };
  prepareStorage?(): void;
  discardPreparedStorage?(): void;
  openStorage(userId: string): Promise<WorkerSqlStorage>;
  openEngine: typeof openEngine;
}

function browserRuntime(): WebEngineRuntime {
  return {
    ...createBrowserStorageRuntime(),
    locks: navigator.locks,
    createChannel: (name) =>
      new BroadcastChannel(name) as unknown as TabChannel & { close(): void },
    openEngine,
  };
}

/**
 * OPFS + Web Locks + BroadcastChannel + worker 都在才启用。同步访问句柄
 * （createSyncAccessHandle）只在 dedicated worker 里暴露，主线程查不到；
 * worker 里打不开时走「副本不可用」退回 REST。
 */
export function isWebEngineSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.locks &&
    typeof navigator.storage?.getDirectory === 'function' &&
    typeof Worker !== 'undefined' &&
    typeof BroadcastChannel !== 'undefined'
  );
}

interface Session {
  userId: string;
  tab: TabEngine;
  channel: TabChannel & { close(): void };
  /** 释放 leader 锁（resolve 后锁回调返回）。 */
  releaseLock: () => void;
  /** 本标签页作为 leader 时的 Engine 与清理。 */
  leader: { engine: Engine; stop(): Promise<void> } | null;
  unsubscribers: Array<() => void>;
  /** 恢复 React Query 的默认网络模式（退回 REST 时）。 */
  restoreQueryDefaults: () => void;
  stopped: boolean;
}

let session: Session | null = null;
let unsubscribeAuth: (() => void) | null = null;

/** 供诊断/测试：本标签页当前的 Engine 门面。 */
export function getWebEngine(): Engine | null {
  return session?.tab ?? null;
}

/** 与 initEventStream 同一模式：订阅登录态自动启停。不支持的浏览器为 no-op。 */
export function initWebEngine(
  queryClient: QueryClient,
  runtime: WebEngineRuntime | null = isWebEngineSupported() ? browserRuntime() : null,
): void {
  if (!runtime || unsubscribeAuth) return;
  const sync = () => {
    const { token, user } = useAuthStore.getState();
    // 身份恢复的 HTTP 请求与 SQLite/WASM 初始化并行；此时尚不打开账号库。
    if (token && !session) runtime.prepareStorage?.();
    if (!token) runtime.discardPreparedStorage?.();
    if (token && user) {
      if (session?.userId !== user.id) {
        void stopWebEngine();
        startSession(queryClient, runtime, user.id);
      }
    } else if (session) {
      void stopWebEngine();
    }
  };
  const offAuth = useAuthStore.subscribe(sync);
  unsubscribeAuth = () => {
    offAuth();
    runtime.discardPreparedStorage?.();
  };
  sync();
}

function startSession(queryClient: QueryClient, runtime: WebEngineRuntime, userId: string): void {
  const deviceId = ensureDeviceId();
  const channel = runtime.createChannel(`taskora-engine:${userId}`);
  const tab = new TabEngine(channel, deviceId);
  let releaseLock!: () => void;
  const lockHeld = new Promise<void>((resolve) => (releaseLock = resolve));
  const current: Session = {
    userId,
    tab,
    channel,
    releaseLock,
    leader: null,
    unsubscribers: [() => runtime.discardPreparedStorage?.()],
    restoreQueryDefaults: () => undefined,
    stopped: false,
  };
  session = current;

  // 全域注入：hooks 读写本标签页的 TabEngine
  setTaskBackend(createEngineTaskBackend({ engine: tab }));
  setProjectBackend(createEngineProjectBackend({ engine: tab }));
  setAreaBackend(createEngineAreaBackend({ engine: tab }));
  setTagBackend(createEngineTagBackend({ engine: tab }));
  setProjectHeadingBackend(createEngineProjectHeadingBackend({ engine: tab }));
  // SSE 只作「远端有变更」的提示（leader 据此 pull），界面由响应式查询驱动
  setEventStreamCacheSurgery(false);
  // 读写都是本地的：浏览器报告离线时 React Query 默认暂停查询与 mutation
  // （networkMode 'online'），离线写入就不会出现在界面上。
  current.restoreQueryDefaults = runQueriesWhileOffline(queryClient);
  // 界面读改由本标签页的响应式查询提供（local-first-v3 issue 06）：读经
  // leader 代理，只在 leader 广播的变更影响其依赖时重跑。
  attachLiveQueries(tab);
  current.unsubscribers.push(
    tab.onStatus((status, pendingCount) => setSyncStatus(status, pendingCount)),
    tab.onUnavailable((reason) => fallBackToRest(current, queryClient, reason)),
  );

  // 聚焦时让 leader 同步一轮（本标签页就是 leader 时直接执行）
  const onFocus = () => void tab.sync().catch(() => undefined);
  window.addEventListener('focus', onFocus);
  current.unsubscribers.push(() => window.removeEventListener('focus', onFocus));

  // 排队争 leader：拿到锁就一直持有，直到登出 / 标签页关闭
  void runtime.locks
    .request(`taskora-replica:${userId}`, async () => {
      if (current.stopped) return;
      await becomeLeader(current, runtime, deviceId);
      await lockHeld;
    })
    .catch((error: unknown) => console.error('[web-engine] leader 锁失败', error));
}

async function becomeLeader(
  current: Session,
  runtime: WebEngineRuntime,
  deviceId: string,
): Promise<void> {
  const { tab, channel, userId } = current;
  let engine: Engine;
  try {
    const storage = await runtime.openStorage(userId);
    engine = await runtime.openEngine({
      storage,
      deviceId,
      transport: createHttpSyncTransport('web'),
    });
  } catch (error) {
    console.error('[web-engine] 副本打开失败，所有标签页退回 REST', error);
    const reason = error instanceof ReplicaSchemaTooNewError ? 'upgrade-required' : 'error';
    // 继续持有锁并回答后来的标签页，免得它们各自再试一遍
    const answer = (event: MessageEvent<TabMessage>) => {
      if (event.data.kind === 'ping') channel.postMessage({ kind: 'unavailable', reason });
    };
    channel.addEventListener('message', answer);
    current.unsubscribers.push(() => channel.removeEventListener('message', answer));
    channel.postMessage({ kind: 'unavailable', reason });
    tab.emitUnavailable(reason);
    return;
  }
  if (current.stopped) {
    await engine.close();
    return;
  }

  let syncInFlight: Promise<boolean> | null = null;
  let syncRequested = false;
  let upgradeRequired = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const host = createEngineHost(channel, engine, deviceId + ':' + globalThis.crypto.randomUUID(), {
    sync: () => syncNow(),
  });
  const publishStatus = (status: SyncStatus, pendingCount = 0) => {
    tab.emitStatus(status, pendingCount);
    host.broadcastStatus(status, pendingCount);
  };

  /** flush + pull；并发调用合并为一个在飞任务，成败驱动同步指示器。 */
  function syncNow(): Promise<boolean> {
    if (current.stopped || upgradeRequired) return Promise.resolve(false);
    if (syncInFlight) {
      syncRequested = true;
      return syncInFlight;
    }
    publishStatus('syncing');
    const run = engine
      .sync()
      .then(() => {
        publishStatus('synced');
        return true;
      })
      .catch(async (error: unknown) => {
        if (error instanceof SyncUpgradeRequiredError) {
          upgradeRequired = true;
          stopTimers();
          publishStatus('upgrade-required', await engine.pendingCount());
          return false;
        }
        // 断网 / 服务器维护：静默退避，等下个时机；离线·N 条待同步
        publishStatus('offline', await engine.pendingCount().catch(() => 0));
        return false;
      })
      .finally(() => {
        syncInFlight = null;
        if (syncRequested) {
          syncRequested = false;
          void syncNow();
        }
      });
    syncInFlight = run;
    return run;
  }

  const scheduleSync = (delayMs: number) => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void syncNow();
    }, delayMs);
  };
  const interval = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
  const stopTimers = () => {
    clearInterval(interval);
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = null;
  };

  const offChange = engine.onChange((change) => {
    tab.emitChange(change);
    host.broadcastChange(change);
    // 本地写（任一标签页）防抖同步；远端写应用后无新 Outbox，再拉是空转
    if (change.origin === 'local') scheduleSync(1_000);
  });
  const offRemote = onRemoteChangeEvent(() => void syncNow());

  current.leader = {
    engine,
    async stop() {
      stopTimers();
      offChange();
      offRemote();
      host.stop();
      await engine.close();
    },
  };
  tab.becomeLeader(host.execute);
  registerSyncDevice(deviceId, 'web').catch(() => undefined); // 注册失败不阻塞本地使用

  // 首次同步：cursor 为 0 时 hub 判 resync，engine.pull 转走 bootstrap 拉
  // 全量快照。首次失败且副本从未同步过时退避重试直到成功——否则新浏览器
  // 对着空副本渲染「数据全没了」。
  if (!(await syncNow()) && (await engine.cursor()) === 0) {
    let delayMs = 2_000;
    while (!current.stopped && !upgradeRequired && (await engine.cursor()) === 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (current.stopped || (await syncNow())) return;
      delayMs = Math.min(delayMs * 2, 15_000);
    }
  }
}

/** 副本不可用：本标签页退回 REST（同步指示器只在需要升级时保留提示）。 */
function fallBackToRest(current: Session, queryClient: QueryClient, reason: string): void {
  if (session !== current) return;
  current.restoreQueryDefaults();
  resetBackends();
  setEventStreamCacheSurgery(true);
  setSyncStatus(reason === 'upgrade-required' ? 'upgrade-required' : 'idle');
  createEngineInvalidator(queryClient)();
}

/** 登出 / 换账号：退回 REST，释放 leader 锁与副本（OPFS 数据保留）。 */
export async function stopWebEngine(): Promise<void> {
  const current = session;
  if (!current) return;
  session = null;
  current.stopped = true;
  current.unsubscribers.forEach((off) => off());
  current.restoreQueryDefaults();
  resetBackends();
  setEventStreamCacheSurgery(true);
  setSyncStatus('idle');
  await current.tab.close();
  await current.leader?.stop().catch(() => undefined);
  current.releaseLock();
  current.channel.close();
}

/** 查询与 mutation 不再因浏览器离线而暂停；返回恢复原设置的函数。 */
function runQueriesWhileOffline(queryClient: QueryClient): () => void {
  const previous = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    ...previous,
    queries: { ...previous.queries, networkMode: 'always' },
    mutations: { ...previous.mutations, networkMode: 'always' },
  });
  return () => queryClient.setDefaultOptions(previous);
}

function resetBackends(): void {
  detachLiveQueries();
  setTaskBackend(undefined);
  setProjectBackend(undefined);
  setAreaBackend(undefined);
  setTagBackend(undefined);
  setProjectHeadingBackend(undefined);
}

/** 每个浏览器（配置文件）一个 device id：同一副本的所有标签页共用。 */
function ensureDeviceId(): string {
  let deviceId = globalThis.localStorage?.getItem(DEVICE_ID_KEY) ?? null;
  if (!deviceId) {
    deviceId = globalThis.crypto.randomUUID();
    globalThis.localStorage?.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/** 测试用：拆掉登录态订阅与会话。 */
export async function resetWebEngineForTests(): Promise<void> {
  unsubscribeAuth?.();
  unsubscribeAuth = null;
  await stopWebEngine();
}
