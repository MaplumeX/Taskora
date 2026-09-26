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

/**
 * 系统默认提示音的平台字面量（返回 undefined = 不传 sound）。
 *
 * 桌面端不传 sound 不等于「交给系统决定」，而是**静音**：插件把它落成
 * notify-rust 的 `sound_name: None`，Windows 侧于是写出
 * `<audio silent="true"/>`，macOS 侧写出空 soundName。所以必须显式给值。
 *
 * - Windows：winrt `Sound::from_str` 的枚举名，大小写敏感。解析失败会被
 *   `.ok()` 吞成 `None`（静音且无任何日志），故只能精确写 "Default"。
 * - macOS：notify-rust 把它包成 `Sound::Custom(name)` 写进 soundName；
 *   `NSUserNotificationDefaultSoundName` 的实际值就是 "default"。
 * - Linux：notify-rust 的 XDG 后端不读 `sound_name`（只有手写
 *   `Hint::SoundName` 才生效，而插件不暴露 hints），传任何值都不会响，
 *   故不传。
 */
export function defaultSound(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return 'Default';
  if (/Mac/.test(ua)) return 'default';
  return undefined;
}

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
      try {
        // 显式给 sound：桌面端缺省即静音（见 defaultSound 注释）。
        // await：未 await 的 rejection 逃逸调用方 catch，失败无迹可查。
        const sound = defaultSound();
        await sendNotification(sound === undefined ? { title, body } : { title, body, sound });
      } catch (error) {
        console.warn('[reminders] fireNow failed:', error);
      }
    },
    async openSettings() {
      await invoke('open_notification_settings');
    },
  };
}
