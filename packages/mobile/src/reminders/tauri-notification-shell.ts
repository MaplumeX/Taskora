/**
 * 移动端通知薄壳（Reminders spec）：tauri-plugin-notification 的适配层。
 *
 * 移动走 system 模式（ReminderCoordinator 经 shell 注册系统级定时通知，
 * App 关闭/离线仍按系统排程触发）。Android 通知必须归属 Channel：首次
 * 注册前确保 reminders 渠道存在。字符串 key → 稳定 32 位数字 id
 * （notificationIdForKey），注销与重启后的重复注册都命中同一系统通知。
 */

import { invoke } from '@tauri-apps/api/core';
import {
  cancel,
  channels,
  createChannel,
  isPermissionGranted,
  requestPermission,
  sendNotification,
  Importance,
  Schedule,
} from '@tauri-apps/plugin-notification';

import { notificationIdForKey, type ReminderNotificationShell } from '@taskora/api';

const CHANNEL_ID = 'reminders';

let channelReady: Promise<void> | null = null;

/** Android 8+：通知必须归属已存在的 Channel，否则静默不触发。 */
function ensureChannel(): Promise<void> {
  channelReady ??= (async () => {
    const existing = await channels();
    if (!existing.some((channel) => channel.id === CHANNEL_ID)) {
      await createChannel({
        id: CHANNEL_ID,
        name: 'Taskora',
        importance: Importance.High,
      });
    }
  })().catch(() => undefined);
  return channelReady;
}

export function createMobileNotificationShell(): ReminderNotificationShell {
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
    async schedule(key, title, body, fireAt) {
      try {
        await ensureChannel();
        sendNotification({
          id: notificationIdForKey(key),
          channelId: CHANNEL_ID,
          title,
          body,
          // App 关闭仍按时触发；allowWhileIdle 降低 Doze 模式下的延迟。
          schedule: Schedule.at(new Date(fireAt), false, true),
        });
      } catch {
        // 注册失败静默（下次数据变更重算时重试）
      }
    },
    async cancel(key) {
      try {
        await cancel([notificationIdForKey(key)]);
      } catch {
        // 无对应注册时忽略
      }
    },
    async fireNow(title, body) {
      try {
        await ensureChannel();
        sendNotification({ channelId: CHANNEL_ID, title, body });
      } catch {
        // 忽略
      }
    },
    async openSettings() {
      await invoke('open_notification_settings');
    },
  };
}
