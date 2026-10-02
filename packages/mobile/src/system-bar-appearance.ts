/**
 * 系统栏图标明暗：edge-to-edge 下状态栏 / 导航栏透明，底下是 App 自身背景，
 * 图标明暗必须跟随 App 实际主题（`<html class="dark">`，含手动指定的亮 /
 * 暗），而不是系统 DayNight——否则手动暗色主题下状态栏是深底深图标。
 *
 * 监听 `<html>` 的 class 变化，主题切换时经 background 插件设置。不在 Tauri
 * 下（vitest / 浏览器）静默失败。
 */

import { invoke } from '@tauri-apps/api/core';

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

/** 安装监听；返回清理函数（测试与热替换用）。 */
export function installSystemBarAppearance(): () => void {
  let last: boolean | undefined;
  const sync = () => {
    const dark = isDark();
    if (dark === last) return;
    last = dark;
    void invoke('plugin:background|set_system_bar_appearance', { dark }).catch(() => undefined);
  };

  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  sync();

  return () => observer.disconnect();
}
