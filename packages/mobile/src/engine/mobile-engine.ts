/**
 * Android 端 Engine 装配与前台同步调度 — local-first 完全体（ADR-0007，
 * android-app issue 04）。
 *
 * 与 desktop 同语义接入（登录后全部实体读写切换到本地副本，hooks 零改
 * 动），同步采用**前台触发模型**（spec：不引入 FCM、不做后台周期同步；
 * Outbox 保证断网写不丢）。四个触发点：
 *   1. 启动（Engine 装配后首次 pull / bootstrap）；
 *   2. 每次本地写（Outbox flush 后防抖 push）；
 *   3. 回前台（visibilitychange / focus）pull；
 *   4. 下拉刷新（requestPullSync()，由 PullToRefresh 调用）。
 * 另有 SSE（前台存活的 Event Stream）作为「远端有变更」的提示通道触发
 * pull——它是前台内的传输层提示，不是推送基建（ADR-0007 同口径）。
 *
 * 登出：退回 REST 后端，本地数据保留（Outbox 未推的编辑属于用户数据）。
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
import { createReminderCoordinator, type ReminderCoordinator } from '@taskora/api';

import { createHttpSyncTransport, registerDevice } from './http-transport';
import { createTauriSqlStorage, isTauriRuntime, useUserReplicaDb } from './tauri-storage';
import { createMobileNotificationShell } from '../reminders/tauri-notification-shell';
import { scheduleStatusBarRefresh } from '../status-bar';

const DEVICE_ID_KEY = 'taskora.deviceId';

/**
 * 实体 → 需失效的 query root（失效面对齐 event-applier 的口径）：
 * task/project/feed 互相嵌入计数，tag 嵌入一切带标签芯片的缓存。
 * （与 desktop-engine 同表，两侧变更需同步维护。）
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
let unsubscribeForeground: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeAuth: (() => void) | null = null;
let syncInFlight: Promise<boolean> | null = null;
/** Reminders（reminders spec）：system 模式调度器，随 Engine 生命周期启停。 */
let reminderCoordinator: ReminderCoordinator | null = null;

/** 供诊断/测试：当前 Engine 实例。 */
export function getMobileEngine(): Engine | null {
  return engine;
}

/**
 * 装配移动端 Engine（Tauri 环境专用；非 Tauri 场景为 no-op）。
 * 与 initEventStream 同一模式：订阅登录态自动启停。
 */
export function initMobileEngine(queryClient: QueryClient): void {
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
    // 全域注入（V2）：各域沿用 desktop 已验证的注入模式
    setTaskBackend(createEngineTaskBackend({ engine }));
    setProjectBackend(createEngineProjectBackend({ engine }));
    setAreaBackend(createEngineAreaBackend({ engine }));
    setTagBackend(createEngineTagBackend({ engine }));
    setTagGroupBackend(createEngineTagGroupBackend({ engine }));
    setProjectHeadingBackend(createEngineProjectHeadingBackend({ engine }));
    registerDevice(deviceId).catch(() => undefined); // 注册失败不阻塞本地使用
    // Engine 激活：SSE 只作「触发 engine pull」的提示通道（ADR-0007），
    // 停用 EventStreamApplier 的缓存手术——失效由 engine.onChange 驱动。
    setEventStreamCacheSurgery(false);

    // 副本变更 → UI 缓存失效（本地读，立即生效；按实体粒度），
    // 仅本地写需要防抖调度同步——远端写应用后无新 Outbox，再拉是空转。
    engine.onChange((change) => {
      invalidateEntities(queryClient, change.entities);
      // 状态栏常驻通知（android-status-bar）：任务变更后防抖刷新内容
      // （控制器内部判定开关/会话，未开启时为空操作）。
      scheduleStatusBarRefresh();
      if (change.origin === 'local') {
        scheduleSync(1_000);
      }
    });

    // Event Stream 作为同步传输层（ADR-0007）：SSE live change 到达即
    // 拉取增量。前台存活的连接让多设备变更秒级到达；后台期间连接由
    // 系统冻结，回前台时由下方 focus/visibility 拉平，无推送依赖。
    unsubscribeRemoteChange?.();
    unsubscribeRemoteChange = onRemoteChangeEvent(() => void syncNow());

    // 回前台 pull（触发点 3）：后台恢复时 visibility 与 focus 都可能
    // 单独触发（厂商 WebView 行为不一），syncNow 自身并发合并。
    unsubscribeForeground?.();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    unsubscribeForeground = () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };

    // 触发点 1（启动）：首次装配先 bootstrap（新设备全量快照），此后走
    // 增量。首次失败且副本尚未同步过（cursor === 0，本地无数据）时
    // 激进退避重试直到首次成功——否则新设备对着空副本渲染「数据全没了」。
    if (!(await syncNow()) && (await engine.cursor()) === 0) {
      await retryUntilFirstSync();
    }
    // Reminders：副本变更 + 周期 tick 驱动，注册系统级定时通知
    // （system 模式：App 关闭/离线仍触发）。首次对齐在启动时补齐系统
    // 侧注册（设备重启后系统排程清空，重启 App 重新登记）。
    reminderCoordinator = createReminderCoordinator({
      engine,
      shell: createMobileNotificationShell(),
      mode: 'system',
    });
    reminderCoordinator.start();
  } catch (error) {
    console.error('[mobile-engine] 装配失败，退回 REST 后端', error);
    stopReminderCoordinator();
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
  stopReminderCoordinator();
  resetBackends();
  // 退回 REST 后端：恢复 SSE 缓存手术（web 同款失效路径）
  setEventStreamCacheSurgery(true);
  setSyncStatus('idle');
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  unsubscribeRemoteChange?.();
  unsubscribeRemoteChange = null;
  unsubscribeForeground?.();
  unsubscribeForeground = null;
  void engine?.close().catch(() => undefined);
  engine = null;
  // 登出丢弃 device id：重新登录分配新 device id（ADR-0007），
  // 本地数据（SQLite 文件）保留。
  globalThis.localStorage?.removeItem(DEVICE_ID_KEY);
}

function stopReminderCoordinator(): void {
  reminderCoordinator?.stop();
  reminderCoordinator = null;
}

/** flush + pull；并发调用合并为一个在飞任务。成败驱动同步指示器（V2）。 */
export function syncNow(): Promise<boolean> {
  if (!engine) return Promise.resolve(false);
  if (syncInFlight) return syncInFlight;
  setSyncStatus('syncing');
  syncInFlight = engine
    .sync()
    .then(() => {
      // 已同步：Outbox 清空、增量拉平
      setSyncStatus('synced');
      return true;
    })
    .catch(async () => {
      // 断网/服务器维护：静默退避，等下个前台时机；离线·N 条待同步。
      // 不用 navigator.onLine：服务器不可达不应被假在线掩盖。
      setSyncStatus('offline', await engine!.pendingCount());
      return false;
    })
    .finally(() => {
      syncInFlight = null;
    });
  return syncInFlight;
}

/**
 * 下拉刷新（触发点 4）：手动确认服务器上的最新变更。
 * 副本非空时同样走 flush + pull（Outbox 优先收敛，避免读旧写晚）。
 */
export async function requestPullSync(): Promise<void> {
  await syncNow();
}

/**
 * 首次同步（副本为空）失败的退避重试：2s 起步、倍增至 15s 封顶，
 * 直到首次同步成功或 Engine 被停用。常规同步不在此路径。
 */
async function retryUntilFirstSync(): Promise<void> {
  let delayMs = 2_000;
  while (engine && (await engine.cursor()) === 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (!engine) return;
    if (await syncNow()) return;
    delayMs = Math.min(delayMs * 2, 15_000);
  }
}

/** 写后防抖同步（触发点 2）：连续录入一串任务只触发一次 flush/pull。 */
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

/** 测试专用：重置模块级装配状态（不触碰 backends / auth store）。 */
export function __resetForTest(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  unsubscribeRemoteChange?.();
  unsubscribeRemoteChange = null;
  unsubscribeForeground?.();
  unsubscribeForeground = null;
  unsubscribeAuth?.();
  unsubscribeAuth = null;
  engine = null;
  syncInFlight = null;
}
