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

import { addPluginListener, invoke } from '@tauri-apps/api/core';

import {
  i18n,
  reminderActionLabels,
  type ReminderActionRequest,
  type ReminderNotificationShell,
  type ReminderReliabilityStatus,
} from '@taskora/api';
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
        args: {
          reminders: plan,
          channelName: i18n.t('task:reminderChannelName'),
          // 通知按钮文案（reminder-actions spec）：原生不维护翻译，随计划持久化。
          labels: reminderActionLabels(),
        },
      });
    },
    takePendingActions() {
      return invoke<ReminderActionRequest[]>('plugin:reminders|take_pending_actions');
    },
    async onActionsAvailable(listener) {
      const handle = await addPluginListener('reminders', 'actions-available', listener);
      return () => void handle.unregister().catch(() => undefined);
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

/**
 * 点通知正文启动/唤回 App 时携带的任务（reminder-actions spec）：取出即删。
 * 冷启动时原生在 JS 就绪前就收到了意图，因此以「取」而非仅靠事件。
 */
export function takeLaunchTask(): Promise<string | null> {
  return invoke<string | null>('plugin:reminders|take_launch_task');
}

/** App 存活时点通知正文（onNewIntent）：原生通知有新的待打开任务。 */
export async function onOpenTask(listener: () => void): Promise<() => void> {
  const handle = await addPluginListener('reminders', 'open-task', listener);
  return () => void handle.unregister().catch(() => undefined);
}
