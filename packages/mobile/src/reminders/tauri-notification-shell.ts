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
  createChannel,
  isPermissionGranted,
  requestPermission,
  Importance,
  Schedule,
} from '@tauri-apps/plugin-notification';

import { notificationIdForKey, type ReminderNotificationShell } from '@taskora/api';
import { listNotificationChannels, postNotification } from '../notification-bridge';

const CHANNEL_ID = 'reminders';

let channelReady: Promise<void> | null = null;

/**
 * Android 8+：通知必须归属已存在的 Channel，否则静默不触发。
 * 失败不缓存（典型诱因：授权未授予时 channels() 拒绝）——缓存失败会让
 * 本会话内渠道永远建不起来、后续通知全部被系统静默丢弃；下次调用重试，
 * 授权恢复后自愈。
 */
function ensureChannel(): Promise<void> {
  if (channelReady === null) {
    channelReady = (async () => {
      const existing = await listNotificationChannels();
      if (!existing.some((channel) => channel.id === CHANNEL_ID)) {
        await createChannel({
          id: CHANNEL_ID,
          name: 'Taskora',
          importance: Importance.High,
        });
      }
    })();
    channelReady.catch(() => {
      channelReady = null;
    });
  }
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
        // 授权未授予时系统侧注册必然失败（Android 13+ 运行时授权；
        // 多设备同步来的提醒本机可能从未弹过授权框）。显式预检让失败
        // 原因可观测，rethrow 交给 coordinator 下 tick 重试。
        if (!(await isPermissionGranted())) {
          throw new Error('notification permission not granted');
        }
        await ensureChannel();
        // 必须 await：未 await 的 rejection 逃逸 try/catch，注册失败
        // 完全无迹可循（本 bug 的排查黑洞）。
        await postNotification({
          id: notificationIdForKey(key),
          channelId: CHANNEL_ID,
          title,
          body,
          // App 关闭仍按时触发；allowWhileIdle 降低 Doze 模式下的延迟。
          // （Schedule.at 签名：(date, repeating, allowWhileIdle)）
          schedule: Schedule.at(new Date(fireAt), false, true),
        });
      } catch (error) {
        console.warn('[reminders] schedule failed:', error);
        throw error;
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
        await postNotification({ channelId: CHANNEL_ID, title, body });
      } catch (error) {
        console.warn('[reminders] fireNow failed:', error);
      }
    },
    async openSettings() {
      await invoke('open_notification_settings');
    },
  };
}
