import { invoke } from '@tauri-apps/api/core';

import type { ReminderReliabilityStatus } from '@taskora/api';

/**
 * 通知授权的实时原生查询（reminders / status-bar 同一口径）。
 *
 * 走仓库内 reminders 插件（ADR-0014），不经 tauri-plugin-notification：
 * 后者的 guest-js 读的是会话内缓存的 window.Notification.permission，且其
 * requestPermissions 在 Android 13+ 已授权时永不 resolve。
 */
export async function isNativeNotificationPermissionGranted(): Promise<boolean> {
  try {
    return (await invoke<ReminderReliabilityStatus>('plugin:reminders|status')).notifications;
  } catch {
    return false;
  }
}

/** 请求授权；已授权时立即返回 true，Android 13 以下返回应用级通知开关。 */
export async function requestNativeNotificationPermission(): Promise<boolean> {
  try {
    return (await invoke<boolean>('plugin:reminders|request_permission')) === true;
  } catch {
    return false;
  }
}
