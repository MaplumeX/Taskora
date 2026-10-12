/**
 * 登出与多窗口（.scratch/multi-window）：副窗口不显示登录页。
 *
 * - 主窗口登出（含刷新被拒）：关掉全部副窗口。
 * - 副窗口登出：通知主窗口一起登出（会话是共享的，服务器端已吊销），
 *   然后关闭自己；主窗口回到登录页。
 */

import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { useAuthStore } from '@taskora/api';

import { isTauriRuntime } from '../engine/tauri-storage';
import { MAIN_WINDOW } from './window-channel';

export const SIGNED_OUT_EVENT = 'taskora://signed-out';

const signedIn = (state: { token: string | null; user: unknown }) => !!state.token && !!state.user;

/** 订阅「已登录 → 已登出」的转变。 */
function onSignedOut(handler: () => void): () => void {
  return useAuthStore.subscribe((state, previous) => {
    if (signedIn(previous) && !signedIn(state)) handler();
  });
}

export function coupleMainWindowSession(): void {
  if (!isTauriRuntime()) return;
  onSignedOut(() => {
    void invoke('close_secondary_windows').catch(() => undefined);
  });
  void listen(SIGNED_OUT_EVENT, () => {
    if (signedIn(useAuthStore.getState())) void useAuthStore.getState().clear();
  });
}

export function coupleSecondaryWindowSession(): void {
  if (!isTauriRuntime()) return;
  onSignedOut(() => {
    void emitTo(MAIN_WINDOW, SIGNED_OUT_EVENT)
      .catch(() => undefined)
      .finally(() => void getCurrentWindow().close());
  });
}
