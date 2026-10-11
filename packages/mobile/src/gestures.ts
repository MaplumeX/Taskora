import {
  installUndoBoundaries,
  setHaptics,
  useUndoPromptStore,
  type HapticKind,
} from '@taskora/api';
import { addPluginListener, invoke } from '@tauri-apps/api/core';

import { isTauriRuntime } from './back-navigation';

/**
 * 手势的原生部分（对齐 Things 3 iPhone）：
 * - 触感：共享 UI 的 haptic() 经 background 插件的 performHapticFeedback 触发；
 * - 摇一摇撤销：background 插件检测到摇晃推送 `shake`，请求撤销确认
 *   （UndoPrompt）；撤销步骤以用户输入划分（installUndoBoundaries）。
 *
 * 浏览器预览（dev:vite）与 vitest 不在 Tauri 里：只装撤销边界，不注入触感。
 */
export async function installGestures(): Promise<() => void> {
  const uninstallBoundaries = installUndoBoundaries();
  if (!isTauriRuntime()) return uninstallBoundaries;

  setHaptics((kind: HapticKind) => {
    void invoke('plugin:background|haptic', { kind }).catch(() => undefined);
  });
  try {
    const handle = await addPluginListener('background', 'shake', () => {
      // 已有弹层（卡片 / 菜单 / 设置）时不叠加确认，避免撤销作用对象不明。
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      useUndoPromptStore.getState().request();
    });
    return () => {
      uninstallBoundaries();
      setHaptics(null);
      void handle.unregister().catch(() => undefined);
    };
  } catch {
    return () => {
      uninstallBoundaries();
      setHaptics(null);
    };
  }
}
