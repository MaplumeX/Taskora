/**
 * 打开副窗口（.scratch/multi-window）：Rust 侧 open_window 建窗口，尺寸取
 * 发起窗口、位置层叠错开。主窗口与副窗口都注入 setWindowOpener，共享 UI
 * 的「在新窗口中打开」、⌥ + 点击与 ⌃⌘N 都走这里。
 */

import { invoke } from '@tauri-apps/api/core';

import { setWindowOpener } from '@taskora/api';

import { isTauriRuntime } from '../engine/tauri-storage';

export function openWindow(route: string): void {
  void invoke('open_window', { route }).catch((error: unknown) =>
    console.warn('[windows] 打开新窗口失败', error),
  );
}

export function installWindowOpener(): void {
  if (isTauriRuntime()) setWindowOpener(openWindow);
}

/**
 * 本窗口当前所在的列表：新窗口按钮在 Router 之外（WindowChrome），⌥ + 点击
 * 时读它。MainApp 的 RouteTracker 写入。
 */
let currentRoute = '/today';

export function setCurrentRoute(route: string): void {
  currentRoute = route;
}

export function getCurrentRoute(): string {
  return currentRoute;
}
