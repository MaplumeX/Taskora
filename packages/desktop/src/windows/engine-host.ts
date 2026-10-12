/**
 * 主窗口侧：把唯一的 Engine 提供给副窗口（ADR-0025）。主窗口关闭只是隐藏，
 * 所以它是常驻 leader：不选举、不换届。
 *
 * - Engine 就绪：createEngineHost 应答 ping、执行调用、广播变更与同步状态；
 *   副窗口的 sync 走主窗口的同步调度（合并并发、驱动指示器）。
 * - Engine 不可用（装配失败 / 副本需要升级）：广播 unavailable，并回答之后
 *   打开的副窗口，它们退回 REST。
 */

import {
  createEngineHost,
  useSyncStatusStore,
  type TabChannel,
  type UnavailableReason,
} from '@taskora/api';
import type { Engine } from '@taskora/engine';

import { isTauriRuntime } from '../engine/tauri-storage';
import { createWindowChannel, MAIN_WINDOW } from './window-channel';

let channel: TabChannel | null = null;
let host: ReturnType<typeof createEngineHost> | null = null;
let unavailable: UnavailableReason | null = null;
const unsubscribers: Array<() => void> = [];

function ensureChannel(): TabChannel {
  if (channel) return channel;
  const created = createWindowChannel(MAIN_WINDOW);
  // 先于 host 注册：新副窗口的 ping 先拿到当前同步状态，再收到 hello。
  created.addEventListener('message', (event) => {
    if (event.data.kind !== 'ping') return;
    if (unavailable) {
      created.postMessage({ kind: 'unavailable', reason: unavailable });
    } else if (host) {
      const { status, pendingCount } = useSyncStatusStore.getState();
      host.broadcastStatus(status, pendingCount);
    }
  });
  channel = created;
  return created;
}

/** 主窗口启动时调用：Engine 就绪之前打开的副窗口也有人应答。 */
export function initWindowHost(): void {
  if (isTauriRuntime()) ensureChannel();
}

/** Engine 装配完成：开始为副窗口服务。sync 为主窗口的同步调度。 */
export function serveEngine(engine: Engine, sync: () => Promise<unknown>): void {
  if (!isTauriRuntime()) return;
  stopServing();
  unavailable = null;
  const current = createEngineHost(ensureChannel(), engine, MAIN_WINDOW, { sync });
  host = current;
  unsubscribers.push(
    engine.onChange((change) => current.broadcastChange(change)),
    useSyncStatusStore.subscribe((state) =>
      current.broadcastStatus(state.status, state.pendingCount),
    ),
  );
}

/** 停止服务（登出）；带 reason 时告知副窗口副本不可用（装配失败）。 */
export function stopServing(reason?: UnavailableReason): void {
  unsubscribers.splice(0).forEach((off) => off());
  host?.stop();
  host = null;
  if (!reason || !isTauriRuntime()) return;
  unavailable = reason;
  ensureChannel().postMessage({ kind: 'unavailable', reason });
}
