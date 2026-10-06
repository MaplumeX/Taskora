/**
 * quick-add 事件中继：主窗口侧（V2 spec；quick-add-v2 issue 01 扩展协议，
 * 事件名与载荷见 quick-add-protocol）。
 *
 * quick-add 是独立 webview，不再直调 REST：读写都经 Tauri event 交给主
 * 窗口，由主窗口的单一 Engine 实例执行（进 Outbox）。单一 Engine 实例、
 * 单一 Outbox、单一 HLC——quick-add 不自开 Engine（双实例共享一份
 * SQLite 会在存储层重新发明锁）。未装配 Engine 时（REST 回退），各
 * backend 即 REST 实现，行为与旧路径一致。
 *
 * - 读：quick-add 打开时发 snapshot-request，主窗口从本地副本取 Projects /
 *   Areas / Tags 回发 snapshot（离线可用）。
 * - 写：submit 携带完整草稿，落库走共用的 createFromQuickAddDraft（与
 *   Android 状态栏浮层同一套转换与校验）；旧载荷 { title } 仍接受。
 * - 回执：result 告知 quick-add 实际落入的位置；失败时另发系统通知——
 *   quick-add 已隐藏、主窗口也可能不可见，toast 未必有人看到。
 */

import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';

import {
  createFromQuickAddDraft,
  getAreas,
  getProjects,
  getTags,
  i18n,
  toQuickAddDraft,
  type QuickAddDraft,
} from '@taskora/api';
import { toast } from '@taskora/ui/components/ui/sonner';

import { isTauriRuntime } from './engine/tauri-storage';
import {
  QUICK_ADD_RESULT_EVENT,
  QUICK_ADD_SNAPSHOT_EVENT,
  QUICK_ADD_SNAPSHOT_REQUEST_EVENT,
  QUICK_ADD_SUBMIT_EVENT,
  QUICK_ADD_WINDOW,
  type QuickAddResultPayload,
  type QuickAddSnapshot,
  type QuickAddSnapshotRequest,
  type QuickAddSubmitPayload,
} from './quick-add-protocol';

function draftOf(payload: unknown): { draft: QuickAddDraft; requestId?: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  const requestId = typeof raw.requestId === 'string' ? raw.requestId : undefined;
  const draft = toQuickAddDraft('draft' in raw ? raw.draft : raw);
  return draft ? { draft, requestId } : null;
}

async function notifyFailure(title: string): Promise<void> {
  try {
    await invoke('plugin:notification|notify', {
      options: {
        title: i18n.t('task:quickAddFailed', { defaultValue: 'Could not create the task' }),
        body: title,
      },
    });
  } catch (error) {
    console.warn('[quick-add] 失败通知发送失败', error);
  }
}

async function handleSubmit(payload: unknown): Promise<void> {
  const submitted = draftOf(payload);
  if (!submitted) return;
  const { draft, requestId } = submitted;
  try {
    const result = await createFromQuickAddDraft(draft);
    if (!result) return;
    await emitTo<QuickAddResultPayload>(QUICK_ADD_WINDOW, QUICK_ADD_RESULT_EVENT, {
      requestId,
      ok: true,
      ...result,
    }).catch(() => undefined);
  } catch (error) {
    const title = draft.title.trim();
    console.error('[quick-add] 任务创建失败', error);
    toast.error(title);
    await notifyFailure(title);
    await emitTo<QuickAddResultPayload>(QUICK_ADD_WINDOW, QUICK_ADD_RESULT_EVENT, {
      requestId,
      ok: false,
      title,
    }).catch(() => undefined);
  }
}

async function handleSnapshotRequest(payload: unknown): Promise<void> {
  const requestId = (payload as Partial<QuickAddSnapshotRequest> | null)?.requestId;
  if (typeof requestId !== 'string') return;
  try {
    const [projects, areas, tags] = await Promise.all([getProjects(), getAreas(), getTags()]);
    await emitTo<QuickAddSnapshot>(QUICK_ADD_WINDOW, QUICK_ADD_SNAPSHOT_EVENT, {
      requestId,
      projects,
      areas,
      tags,
    });
  } catch (error) {
    // 不应答：quick-add 超时后照常可用（只能进 Inbox）。
    console.warn('[quick-add] 快照读取失败', error);
  }
}

/** 主窗口装配中继（仅 Tauri 环境；非 Tauri 场景为 no-op）。 */
export function initQuickAddRelay(): void {
  if (!isTauriRuntime()) return;
  void listen<QuickAddSubmitPayload>(QUICK_ADD_SUBMIT_EVENT, (event) =>
    handleSubmit(event.payload),
  );
  void listen<QuickAddSnapshotRequest>(QUICK_ADD_SNAPSHOT_REQUEST_EVENT, (event) =>
    handleSnapshotRequest(event.payload),
  );
}
