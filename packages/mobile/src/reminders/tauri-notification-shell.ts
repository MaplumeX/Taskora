/**
 * 移动端通知薄壳（Reminders spec，ADR-0014）：仓库内 reminders 插件的
 * 适配层。
 *
 * 移动走 system 模式：ReminderCoordinator 每次重算把完整期望集交给
 * sync，原生插件持久化计划、自行差量、设置精确闹钟、开机/启动后重设，
 * 并在到点时投递——App 关闭或进程被回收后仍按时触发。JS 侧不保存任何
 * 注册状态，也不再做权限预检：未授权时原生照样落盘计划，授权恢复后
 * 后续提醒自动投递。
 */

import { invoke } from '@tauri-apps/api/core';

import { i18n, type ReminderNotificationShell, type ReminderReliabilityStatus } from '@taskora/api';
import {
  isNativeNotificationPermissionGranted,
  requestNativeNotificationPermission,
} from '../notification-bridge';

export function createMobileNotificationShell(): ReminderNotificationShell {
  return {
    isSupported: () => true,
    isPermissionGranted: isNativeNotificationPermissionGranted,
    requestPermission: requestNativeNotificationPermission,
    async sync(plan) {
      await invoke('plugin:reminders|sync', {
        args: { reminders: plan, channelName: i18n.t('task:reminderChannelName') },
      });
    },
    async clear() {
      await invoke('plugin:reminders|clear');
    },
    async openSettings() {
      await invoke('open_notification_settings');
    },
    reliability() {
      return invoke<ReminderReliabilityStatus>('plugin:reminders|status');
    },
    async openSystemSettings(target) {
      await invoke('plugin:reminders|open_settings', { target });
    },
  };
}
