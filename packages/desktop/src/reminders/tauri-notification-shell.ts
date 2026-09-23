/**
 * 桌面端通知薄壳（Reminders spec）：tauri-plugin-notification 的适配层。
 *
 * 桌面走 runtime 模式（ReminderCoordinator 到点 fireNow），schedule/
 * cancel 不会被调用（系统级排程是移动端路径）；openSettings 走壳层
 * Rust 命令 open_notification_settings。
 */

import { invoke } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

import type { ReminderNotificationShell } from '@taskora/api';

export function createDesktopNotificationShell(): ReminderNotificationShell {
  return {
    isSupported: () => true,
    async isPermissionGranted() {
      try {
        return await isPermissionGranted();
      } catch {
        return false;
      }
    },
    async requestPermission() {
      try {
        return (await requestPermission()) === 'granted';
      } catch {
        return false;
      }
    },
    async schedule() {
      // runtime 模式不注册系统排程；到点由 ReminderCoordinator 触发
      // fireNow（App 未运行期间错过的提醒静默丢弃，spec 定案）。
    },
    async cancel() {
      // 同上：runtime 模式没有系统注册。
    },
    async fireNow(title: string, body: string) {
      sendNotification({ title, body });
    },
    async openSettings() {
      await invoke('open_notification_settings');
    },
  };
}
