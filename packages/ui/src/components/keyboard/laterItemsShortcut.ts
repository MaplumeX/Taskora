import { useKeybindingsStore } from '@taskora/api';

import { detectKeyPlatform, resolveAction, type KeyEventLike } from './keymap';

/**
 * ⇧⌘E（显示 / 隐藏稍后项）在弹窗输入框里的判定：全局快捷键在输入框里让路，
 * Quick Find 与移动选择器在自己的 keydown 里用它切换面板的开关。
 */
export function isToggleLaterItemsKey(e: KeyEventLike): boolean {
  const overrides = useKeybindingsStore.getState().overrides;
  return resolveAction(e, detectKeyPlatform(), overrides)?.type === 'toggleLaterItems';
}
