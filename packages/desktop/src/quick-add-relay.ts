/**
 * quick-add 事件中继（V2 spec）。
 *
 * quick-add 是独立 webview，不再直调 REST：提交时通过 Tauri event 把
 * 任务标题发给主窗口，由主窗口的单一 Engine 实例执行 create（进
 * Outbox）。单一 Engine 实例、单一 Outbox、单一 HLC——quick-add 不自开
 * Engine（双实例共享一份 SQLite 会在存储层重新发明锁）。未装配 Engine
 * 时（REST 回退），currentTaskBackend 即 REST 实现，行为与旧路径一致。
 */

import { listen } from '@tauri-apps/api/event';

import { currentTaskBackend } from '@taskora/api';
import { toast } from '@taskora/ui/components/ui/sonner';

import { isTauriRuntime } from './engine/tauri-storage';

/** quick-add → 主窗口的提交事件名（payload: { title }）。 */
export const QUICK_ADD_SUBMIT_EVENT = 'quick-add://submit';

/** 主窗口装配中继（仅 Tauri 环境；非 Tauri 场景为 no-op）。 */
export function initQuickAddRelay(): void {
  if (!isTauriRuntime()) return;
  void listen<{ title: string }>(QUICK_ADD_SUBMIT_EVENT, (event) => {
    const title = event.payload?.title?.trim();
    if (!title) return;
    void currentTaskBackend()
      .createTask({ title })
      .catch((error) => {
        // 中继是 fire-and-forget：失败在主窗口以 toast 呈现（quick-add
        // 窗口已隐藏）；写后的 onChange 失效负责正常路径的界面刷新。
        console.error('[quick-add] 任务创建失败', error);
        toast.error(title);
      });
  });
}
