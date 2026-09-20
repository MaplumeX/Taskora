/**
 * 桌面端 Engine 装配与同步调度 — local-first 切片一（ADR-0007）。
 *
 * 登录后：注册 device id → 打开 Local Replica（Tauri 侧 SQLite 文件）→
 * 注入 EngineTaskBackend（Task/Feed 的全部 hooks 切换到本地副本）→
 * bootstrap 拉全量快照 → 周期 + 聚焦 + 写后三种时机 flush/pull 收敛。
 * 登出：退回 REST 后端，本地数据保留（副本可丢弃但 Outbox 未推的编辑
 * 属于用户数据，登出不清除数据库文件）。
 */

import type { QueryClient } from '@tanstack/react-query';

import { useAuthStore, onRemoteChangeEvent, setTaskBackend, createEngineTaskBackend } from '@taskora/api';
import { openEngine, type Engine } from '@taskora/engine';

import { createHttpSyncTransport, registerDevice } from './http-transport';
import { createTauriSqlStorage, isTauriRuntime } from './tauri-storage';

const DEVICE_ID_KEY = 'taskora.deviceId';
const SYNC_INTERVAL_MS = 30_000;

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
    const deviceId = ensureDeviceId();
    engine = await openEngine({
      storage: createTauriSqlStorage(),
      deviceId,
      transport: createHttpSyncTransport(),
    });
    setTaskBackend(createEngineTaskBackend({ engine }));
    registerDevice(deviceId).catch(() => undefined); // 注册失败不阻塞本地使用

    // 副本变更 → UI 缓存失效（本地读，立即生效）
    engine.onChange(() => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      scheduleSync(1_000);
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
    setTaskBackend(undefined);
    engine = null;
  }
}

function stopEngine(): void {
  setTaskBackend(undefined);
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

/** flush + pull；并发调用合并为一个在飞任务。 */
function syncNow(): Promise<void> {
  if (!engine) return Promise.resolve();
  if (syncInFlight) return syncInFlight;
  syncInFlight = engine
    .sync()
    .catch(() => undefined) // 断网/服务器维护：静默退避，等下个时机
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
