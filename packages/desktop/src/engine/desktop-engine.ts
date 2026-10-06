/**
 * 桌面端 Engine 装配与同步调度 — local-first 完全体（ADR-0007 / V2）。
 *
 * 登录后：注册 device id → 打开 Local Replica（Tauri 侧 SQLite 文件）→
 * 注入全部域的 Engine backends（Task/Feed/Subtask + Project + Area +
 * Tag + ProjectHeading，hooks 零改动切到本地副本）→
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
  setProjectHeadingBackend,
  createEngineProjectHeadingBackend,
  setSyncStatus,
  attachLiveQueries,
  detachLiveQueries,
  createEngineInvalidator,
  requestTaskReveal,
} from '@taskora/api';
import {
  openEngine,
  ReplicaSchemaTooNewError,
  SyncUpgradeRequiredError,
  type Engine,
} from '@taskora/engine';
import { createReminderCoordinator, type ReminderCoordinator } from '@taskora/api';

import { createHttpSyncTransport, registerDevice } from './http-transport';
import { createTauriSqlStorage, isTauriRuntime, useUserReplicaDb } from './tauri-storage';
import {
  createDesktopNotificationShell,
  onReminderAction,
  type DesktopReminderAction,
} from '../reminders/tauri-notification-shell';

const DEVICE_ID_KEY = 'taskora.deviceId';
const SYNC_INTERVAL_MS = 30_000;

let engine: Engine | null = null;
let unsubscribeRemoteChange: (() => void) | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeAuth: (() => void) | null = null;
let syncInFlight: Promise<boolean> | null = null;
/** 在飞期间又有触发（SSE 提示、本地写）：结束后立即补跑一轮，而不是等下个周期。 */
let syncRequested = false;
/**
 * hub 要求更高的同步协议版本（HTTP 426，local-first-v3 issue 03）：停止
 * 同步直到安装新版本（重新登录会重新尝试）。本地读写照常，Outbox 保留。
 */
let upgradeRequired = false;
/** Reminders（reminders spec）：runtime 模式调度器，随 Engine 生命周期启停。 */
let reminderCoordinator: ReminderCoordinator | null = null;
let unsubscribeReminderActions: (() => void) | null = null;

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
    setProjectHeadingBackend(createEngineProjectHeadingBackend({ engine }));
    registerDevice(deviceId).catch(() => undefined); // 注册失败不阻塞本地使用
    // Engine 激活：SSE 只作「触发 engine pull」的提示通道（ADR-0007），
    // 停用 EventStreamApplier 的缓存手术——界面由响应式查询驱动，
    // 避免回声/远端事件的双重刷新与 sortOrder/position 双权威打架。
    setEventStreamCacheSurgery(false);
    // 界面读改由 Engine 的响应式查询提供（local-first-v3 issue 06）：装配
    // 期间按 REST 渲染的视图随之切到本地副本，之后只在依赖的数据变更时重跑。
    attachLiveQueries(engine);

    // 仅本地写需要防抖调度同步——远端写应用后无新 Outbox，再拉是空转。
    engine.onChange((change) => {
      if (change.origin === 'local') {
        scheduleSync(1_000);
      }
    });

    // Event Stream 作为同步传输层（ADR-0007）：SSE live change 到达即
    // 拉取增量——远端变更秒级到达（Story 9），周期同步只作兜底。
    unsubscribeRemoteChange?.();
    unsubscribeRemoteChange = onRemoteChangeEvent(() => void syncNow());

    // 首次同步：新设备 cursor 为 0，pull 必然被 hub 判为 resync，由
    // engine.pull 转走 bootstrap 拉全量快照；此后走增量。首次失败且
    // 副本尚未同步过（cursor === 0，本地无数据）时激进退避重试直到
    // 首次成功——否则新设备对着空副本渲染「数据全没了」长达一个周期。
    if (!(await syncNow()) && (await engine.cursor()) === 0) {
      await retryUntilFirstSync();
    }
    if (syncTimer === null) {
      syncTimer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
      window.addEventListener('focus', () => void syncNow());
    }
    // Reminders：副本变更 + 周期 tick 驱动，到点 fireNow（runtime 模式）。
    reminderCoordinator = createReminderCoordinator({
      engine,
      shell: createDesktopNotificationShell(),
      mode: 'runtime',
    });
    reminderCoordinator.start();
    // 通知上的选择（reminder-actions spec）：点正文定位任务（Rust 侧已唤出
    // 主窗口），按钮按 Reminder Action 规则写入。
    unsubscribeReminderActions?.();
    unsubscribeReminderActions = null;
    void onReminderAction(handleReminderAction)
      .then((off) => {
        if (engine) unsubscribeReminderActions = off;
        else off();
      })
      .catch(() => undefined);
  } catch (error) {
    console.error('[desktop-engine] 装配失败，退回 REST 后端', error);
    stopReminderCoordinator();
    resetBackends();
    // React Query 里留着的是装配前的结果
    createEngineInvalidator(queryClient)();
    setEventStreamCacheSurgery(true);
    engine = null;
    // 副本由更新版本的 Taskora 写入（降级安装）：不打开它，在线走 REST，
    // 并提示升级——本地未同步的编辑留在副本里，等升级后送出。
    setSyncStatus(error instanceof ReplicaSchemaTooNewError ? 'upgrade-required' : 'idle');
  }
}

/** 全域退回 REST（登出 / 装配失败）。 */
function resetBackends(): void {
  detachLiveQueries();
  setTaskBackend(undefined);
  setProjectBackend(undefined);
  setAreaBackend(undefined);
  setTagBackend(undefined);
  setProjectHeadingBackend(undefined);
}

function stopEngine(): void {
  stopReminderCoordinator();
  resetBackends();
  // 退回 REST 后端：恢复 SSE 缓存手术（web 同款失效路径）
  setEventStreamCacheSurgery(true);
  setSyncStatus('idle');
  upgradeRequired = false;
  stopSyncTriggers();
  unsubscribeRemoteChange?.();
  unsubscribeRemoteChange = null;
  void engine?.close().catch(() => undefined);
  engine = null;
  // 登出丢弃 device id：重新登录分配新 device id（ADR-0007），
  // 本地数据（SQLite 文件）保留。
  globalThis.localStorage?.removeItem(DEVICE_ID_KEY);
}

function handleReminderAction({ taskId, action, firedFireAt, tappedAt }: DesktopReminderAction) {
  if (action === 'open') {
    requestTaskReveal(taskId);
    return;
  }
  void reminderCoordinator
    ?.applyAction({ taskId, action, firedFireAt, tappedAt })
    .catch((error) => console.warn('[reminders] apply action failed:', error));
}

function stopReminderCoordinator(): void {
  unsubscribeReminderActions?.();
  unsubscribeReminderActions = null;
  reminderCoordinator?.stop();
  reminderCoordinator = null;
}

/** 停掉周期与写后防抖同步（登出 / 需要升级）。 */
function stopSyncTriggers(): void {
  if (syncTimer !== null) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/** flush + pull；并发调用合并为一个在飞任务。成败驱动同步指示器（V2）。 */
function syncNow(): Promise<boolean> {
  if (!engine || upgradeRequired) return Promise.resolve(false);
  if (syncInFlight) {
    syncRequested = true;
    return syncInFlight;
  }
  setSyncStatus('syncing');
  syncInFlight = engine
    .sync()
    .then(() => {
      // 已同步：Outbox 清空、增量拉平
      setSyncStatus('synced');
      return true;
    })
    .catch(async (error: unknown) => {
      if (error instanceof SyncUpgradeRequiredError) {
        upgradeRequired = true;
        stopSyncTriggers();
        setSyncStatus('upgrade-required', await engine!.pendingCount());
        return false;
      }
      // 断网/服务器维护：静默退避，等下个时机；离线·N 条待同步。
      // 不用 navigator.onLine：服务器不可达不应被假在线掩盖。
      setSyncStatus('offline', await engine!.pendingCount());
      return false;
    })
    .finally(() => {
      syncInFlight = null;
      if (syncRequested) {
        syncRequested = false;
        void syncNow();
      }
    });
  return syncInFlight;
}

/**
 * 首次同步（副本为空）失败的退避重试：2s 起步、倍增至 15s 封顶，
 * 直到首次同步成功或 Engine 被停用。常规周期同步不在此路径。
 */
async function retryUntilFirstSync(): Promise<void> {
  let delayMs = 2_000;
  while (engine && !upgradeRequired && (await engine.cursor()) === 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (!engine) return;
    if (await syncNow()) return;
    delayMs = Math.min(delayMs * 2, 15_000);
  }
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
