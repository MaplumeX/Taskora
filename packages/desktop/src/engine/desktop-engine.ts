/**
 * 桌面端 Engine 装配与同步调度 — local-first 完全体（ADR-0007 / V2）。
 *
 * 登录后：注册 device id → 打开 Local Replica（Tauri 侧 SQLite 文件）→
 * 注入全部域的 Engine backends（Task/Feed/Subtask + Project + Area +
 * Tag + TagGroup + ProjectHeading，hooks 零改动切到本地副本）→
 * bootstrap 拉全量快照 → 周期 + 聚焦 + 写后三种时机 flush/pull 收敛。
 * 登出：退回 REST 后端，本地数据保留（副本可丢弃但 Outbox 未推的编辑
 * 属于用户数据，登出不清除数据库文件）。
 */

import type { QueryClient } from '@tanstack/react-query';

import {
  useAuthStore,
  onRemoteChangeEvent,
  setEventStreamCacheSurgery,
  setTaskBackend,
  createEngineTaskBackend,
  setProjectBackend,
  createEngineProjectBackend,
  setAreaBackend,
  createEngineAreaBackend,
  setTagBackend,
  createEngineTagBackend,
  setTagGroupBackend,
  createEngineTagGroupBackend,
  setProjectHeadingBackend,
  createEngineProjectHeadingBackend,
  setSyncStatus,
} from '@taskora/api';
import { openEngine, type Engine, type SyncEntity } from '@taskora/engine';

import { createHttpSyncTransport, registerDevice } from './http-transport';
import { createTauriSqlStorage, isTauriRuntime, useUserReplicaDb } from './tauri-storage';

const DEVICE_ID_KEY = 'taskora.deviceId';
const SYNC_INTERVAL_MS = 30_000;

/**
 * 实体 → 需失效的 query root（失效面对齐 event-applier 的口径）：
 * task/project/feed 互相嵌入计数，tag 嵌入一切带标签芯片的缓存。
 */
const INVALIDATION_BY_ENTITY: Record<SyncEntity, string[][]> = {
  task: [['tasks'], ['task'], ['feed'], ['projects'], ['project']],
  subtask: [['tasks'], ['task']],
  project: [['projects'], ['project'], ['feed']],
  'project-heading': [['project-headings']],
  area: [['areas'], ['area'], ['feed']],
  tag: [['tags'], ['tag'], ['tag-groups'], ['tasks'], ['projects'], ['areas'], ['feed']],
  'tag-group': [['tag-groups'], ['tag-group']],
};

const ALL_QUERY_ROOTS = [...new Set(Object.values(INVALIDATION_BY_ENTITY).flat())];

/** 按变更涉及的实体失效对应域；entities 缺省（bootstrap）时全量。 */
function invalidateEntities(queryClient: QueryClient, entities?: SyncEntity[]): void {
  const roots = entities
    ? [...new Set(entities.flatMap((entity) => INVALIDATION_BY_ENTITY[entity] ?? []))]
    : ALL_QUERY_ROOTS;
  for (const root of roots) {
    queryClient.invalidateQueries({ queryKey: root });
  }
}

let engine: Engine | null = null;
let unsubscribeRemoteChange: (() => void) | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeAuth: (() => void) | null = null;
let syncInFlight: Promise<void> | null = null;

/** 供诊断/测试：当前 Engine 实例。 */
export function getDesktopEngine(): Engine | null {
  return engine;
}

/**
 * 装配桌面端 Engine（Tauri 环境专用；非 Tauri 场景为 no-op）。
 * 与 initEventStream 同一模式：订阅登录态自动启停。
 */
export function initDesktopEngine(queryClient: QueryClient): void {
  if (!isTauriRuntime() || unsubscribeAuth) return;

  unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
    const loggedIn = !!state.token && !!state.user;
    const wasLoggedIn = !!previous.token && !!previous.user;
    if (loggedIn && !wasLoggedIn) {
      void startEngine(queryClient);
    } else if (!loggedIn && wasLoggedIn) {
      stopEngine();
    }
  });

  const auth = useAuthStore.getState();
  if (auth.token && auth.user) {
    void startEngine(queryClient);
  }
}

async function startEngine(queryClient: QueryClient): Promise<void> {
  try {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) throw new Error('登录用户缺失，无法选择副本数据库');
    await useUserReplicaDb(userId);
    const deviceId = ensureDeviceId();
    engine = await openEngine({
      storage: createTauriSqlStorage(),
      deviceId,
      transport: createHttpSyncTransport(),
    });
    // 全域注入（V2）：各域沿用 TaskBackend 已验证的注入模式
    setTaskBackend(createEngineTaskBackend({ engine }));
    setProjectBackend(createEngineProjectBackend({ engine }));
    setAreaBackend(createEngineAreaBackend({ engine }));
    setTagBackend(createEngineTagBackend({ engine }));
    setTagGroupBackend(createEngineTagGroupBackend({ engine }));
    setProjectHeadingBackend(createEngineProjectHeadingBackend({ engine }));
    registerDevice(deviceId).catch(() => undefined); // 注册失败不阻塞本地使用
    // Engine 激活：SSE 只作「触发 engine pull」的提示通道（ADR-0007），
    // 停用 EventStreamApplier 的缓存手术——失效由 engine.onChange 驱动，
    // 避免回声/远端事件的双重失效与 sortOrder/position 双权威打架。
    setEventStreamCacheSurgery(false);

    // 副本变更 → UI 缓存失效（本地读，立即生效；按实体粒度），
    // 仅本地写需要防抖调度同步——远端写应用后无新 Outbox，再拉是空转。
    engine.onChange((change) => {
      invalidateEntities(queryClient, change.entities);
      if (change.origin === 'local') {
        scheduleSync(1_000);
      }
    });

    // Event Stream 作为同步传输层（ADR-0007）：SSE live change 到达即
    // 拉取增量——远端变更秒级到达（Story 9），周期同步只作兜底。
    unsubscribeRemoteChange?.();
    unsubscribeRemoteChange = onRemoteChangeEvent(() => void syncNow());

    // 首次装配先 bootstrap（新设备全量快照），此后走增量
    await syncNow();
    if (syncTimer === null) {
      syncTimer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
      window.addEventListener('focus', () => void syncNow());
    }
  } catch (error) {
    console.error('[desktop-engine] 装配失败，退回 REST 后端', error);
    resetBackends();
    setEventStreamCacheSurgery(true);
    engine = null;
    setSyncStatus('idle');
  }
}

/** 全域退回 REST（登出 / 装配失败）。 */
function resetBackends(): void {
  setTaskBackend(undefined);
  setProjectBackend(undefined);
  setAreaBackend(undefined);
  setTagBackend(undefined);
  setTagGroupBackend(undefined);
  setProjectHeadingBackend(undefined);
}

function stopEngine(): void {
  resetBackends();
  // 退回 REST 后端：恢复 SSE 缓存手术（web 同款失效路径）
  setEventStreamCacheSurgery(true);
  setSyncStatus('idle');
  if (syncTimer !== null) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  unsubscribeRemoteChange?.();
  unsubscribeRemoteChange = null;
  void engine?.close().catch(() => undefined);
  engine = null;
  // 登出丢弃 device id：重新登录分配新 device id（ADR-0007），
  // 本地数据（SQLite 文件）保留。
  globalThis.localStorage?.removeItem(DEVICE_ID_KEY);
}

/** flush + pull；并发调用合并为一个在飞任务。成败驱动同步指示器（V2）。 */
function syncNow(): Promise<void> {
  if (!engine) return Promise.resolve();
  if (syncInFlight) return syncInFlight;
  setSyncStatus('syncing');
  syncInFlight = engine
    .sync()
    .then(() => {
      // 已同步：Outbox 清空、增量拉平
      setSyncStatus('synced');
    })
    .catch(async () => {
      // 断网/服务器维护：静默退避，等下个时机；离线·N 条待同步。
      // 不用 navigator.onLine：服务器不可达不应被假在线掩盖。
      setSyncStatus('offline', await engine!.pendingCount());
    })
    .finally(() => {
      syncInFlight = null;
    });
  return syncInFlight;
}

/** 写后防抖同步：连续录入一串任务只触发一次 flush/pull。 */
function scheduleSync(delayMs: number): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncNow();
  }, delayMs);
}

function ensureDeviceId(): string {
  let deviceId = globalThis.localStorage?.getItem(DEVICE_ID_KEY) ?? null;
  if (!deviceId) {
    deviceId = globalThis.crypto.randomUUID();
    globalThis.localStorage?.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}
