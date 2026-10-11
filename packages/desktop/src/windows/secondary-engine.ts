/**
 * 副窗口侧 Engine 装配（ADR-0025）：UI 读写一个 TabEngine，调用经窗口通道
 * 交给主窗口的 Engine 执行；主窗口广播的变更驱动本窗口的响应式查询，同步
 * 状态驱动同步指示器。副窗口不开副本、不跑同步循环 / 提醒调度。
 * 主窗口的副本不可用时退回 REST（与主窗口同一回退路径）。
 */

import type { QueryClient } from '@tanstack/react-query';
import { getCurrentWindow } from '@tauri-apps/api/window';

import {
  attachLiveQueries,
  createEngineAreaBackend,
  createEngineInvalidator,
  createEngineProjectBackend,
  createEngineProjectHeadingBackend,
  createEngineTagBackend,
  createEngineTaskBackend,
  setAreaBackend,
  setEventStreamCacheSurgery,
  setProjectBackend,
  setProjectHeadingBackend,
  setSyncStatus,
  setTagBackend,
  setTaskBackend,
  TabEngine,
  useAuthStore,
  type UnavailableReason,
} from '@taskora/api';

import { readDeviceId, resetEngineBackends } from '../engine/desktop-engine';
import { isTauriRuntime } from '../engine/tauri-storage';
import { createWindowChannel } from './window-channel';

interface Session {
  tab: TabEngine;
  /** 已退回 REST（主窗口的副本不可用）。 */
  fellBack: boolean;
  close(): void;
}

let session: Session | null = null;
let unsubscribeAuth: (() => void) | null = null;

/** 与 initDesktopEngine 同一模式：订阅登录态自动启停。 */
export function initSecondaryEngine(queryClient: QueryClient): void {
  if (!isTauriRuntime() || unsubscribeAuth) return;
  const sync = () => {
    const { token, user } = useAuthStore.getState();
    if (token && user) startSession(queryClient);
    else stopSession();
  };
  unsubscribeAuth = useAuthStore.subscribe(sync);
  sync();
}

function startSession(queryClient: QueryClient): void {
  if (session) return;
  const channel = createWindowChannel(getCurrentWindow().label);
  const tab = new TabEngine(channel, readDeviceId());

  setTaskBackend(createEngineTaskBackend({ engine: tab }));
  setProjectBackend(createEngineProjectBackend({ engine: tab }));
  setAreaBackend(createEngineAreaBackend({ engine: tab }));
  setTagBackend(createEngineTagBackend({ engine: tab }));
  setProjectHeadingBackend(createEngineProjectHeadingBackend({ engine: tab }));
  // SSE 只作远端变更提示（主窗口据此 pull），界面由响应式查询驱动。
  setEventStreamCacheSurgery(false);
  attachLiveQueries(tab);

  // 聚焦时让主窗口同步一轮（与主窗口的聚焦同步同一调度）。
  const onFocus = () => void tab.sync().catch(() => undefined);
  window.addEventListener('focus', onFocus);
  const unsubscribers = [
    tab.onStatus((status, pendingCount) => setSyncStatus(status, pendingCount)),
    tab.onUnavailable((reason) => fallBackToRest(queryClient, reason)),
    () => window.removeEventListener('focus', onFocus),
  ];

  session = {
    tab,
    fellBack: false,
    close() {
      unsubscribers.forEach((off) => off());
      void tab.close();
      channel.close();
    },
  };
}

/** 主窗口的副本不可用：本窗口退回 REST（只在需要升级时保留指示器提示）。 */
function fallBackToRest(queryClient: QueryClient, reason: UnavailableReason): void {
  // 广播与对 ping 的应答可能各到一次
  if (!session || session.fellBack) return;
  session.fellBack = true;
  resetEngineBackends();
  setEventStreamCacheSurgery(true);
  setSyncStatus(reason === 'upgrade-required' ? 'upgrade-required' : 'idle');
  createEngineInvalidator(queryClient)();
}

function stopSession(): void {
  if (!session) return;
  session.close();
  session = null;
  resetEngineBackends();
  setEventStreamCacheSurgery(true);
  setSyncStatus('idle');
}

/** 供诊断 / 测试：本窗口的 Engine 门面。 */
export function getSecondaryEngine(): TabEngine | null {
  return session?.tab ?? null;
}
