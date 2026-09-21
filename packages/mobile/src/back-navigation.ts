/**
 * Android 返回手势级联（issue 05 / ADR-0010）。
 *
 * Tauri v2 在 Android 上把返回键/返回手势桥接为 `app.onBackButtonPress`
 * 事件（@tauri-apps/api ≥ 2.5，注册监听后默认的 webview goBack 行为被
 * 接管，见 tauri PR #14133）。级联语义（spec 用户故事 20）：
 *
 *   1. 有打开的抽屉 / 弹层（Radix dialog / menu / listbox）→ 派发一次
 *      Escape 关闭最顶层一层（Radix DismissableLayer 语义，一次一层）；
 *   2. 否则路由历史可返回（window.history.state.idx > 0）→ history.back()；
 *   3. 否则处于根页 → 退出 App（Rust 侧 app_exit command）。
 *
 * 非监听场景（浏览器 dev:vite / vitest）为 no-op。
 */

import { useEffect } from 'react';
import { onBackButtonPress } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';

/** 打开中的 Radix 浮层选择器：Dialog（含 MobileNavDrawer / 详情 sheet）、菜单、下拉列表。 */
const OPEN_OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
].join(', ');

/** 是否运行在 Tauri 环境中（非 Tauri 场景如 vitest 不注册监听）。 */
export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in globalThis;
}

/** 当前是否有打开的浮层（抽屉 / dialog / 菜单）。 */
export function hasOpenOverlay(): boolean {
  return document.querySelector(OPEN_OVERLAY_SELECTOR) !== null;
}

/**
 * 关闭最顶层浮层：向 document 派发一次合成 Escape keydown。Radix
 * DismissableLayer 监听 document 的 Escape 并只关闭最顶层，天然满足
 * 「一次一层」的级联要求。
 */
export function closeTopOverlay(): boolean {
  if (!hasOpenOverlay()) return false;
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );
  return true;
}

/** 路由历史是否可以返回（react-router v6 在 history.state.idx 记录深度）。 */
export function canNavigateBack(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}

/** 单次返回事件的处理级联（导出供测试）。 */
export function handleBackNavigation(): void {
  if (closeTopOverlay()) return;
  if (canNavigateBack()) {
    window.history.back();
    return;
  }
  // 根页（或未进入路由）：退出 App。Rust 侧 command，非 Tauri 环境忽略。
  void invoke('app_exit').catch(() => undefined);
}

/** 挂载级联监听；组件卸载时移除。非 Tauri 环境为 no-op。 */
export function useBackNavigation(): void {
  useEffect(() => {
    if (!isTauriRuntime()) return;
    // 注册监听本身就接管了 Tauri 的默认返回行为（webview goBack / 退出）。
    const promise = onBackButtonPress(() => handleBackNavigation());
    return () => {
      void promise.then((listener) => listener.unregister()).catch(() => undefined);
    };
  }, []);
}
