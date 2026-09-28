/**
 * 桌面端通知薄壳（Reminders spec）。
 *
 * 桌面走 runtime 模式（ReminderCoordinator 到点 fireNow；App 未运行
 * 期间错过的提醒静默丢弃，spec 定案），不实现系统级 sync（Android
 * 路径）；openSettings 走壳层 Rust 命令 open_notification_settings。
 *
 * 发送走壳层命令 show_reminder（reminder-actions spec）：插件桌面端没有
 * 按钮与点击回调，Rust 侧直接用平台通知 crate 发带按钮的通知，用户的
 * 选择以 reminder-action 事件回传（onReminderAction）。提示音由 Rust 侧
 * 按平台显式设置（插件路径下不传 sound 即静音）。
 *
 * 权限检测绕过插件 guest-js、直调原生命令，与移动端
 * notification-bridge 同一口径（实时查询，不读缓存）。guest-js 的 isPermissionGranted/
 * requestPermission 读写的是 window.Notification.permission——插件 init
 * 脚本注入的会话内缓存，并非系统实时状态：Windows 上 init 脚本启动时
 * 不查原生就把缓存初始化成 'denied'，guest-js 此后恒报未授权，而通知
 * 实际能正常发出（「已禁用」误报的来源）；且用户在系统设置里改动后
 * 缓存不更新。原生命令 desktop 侧恒返回 Granted（插件桌面端没有真实
 * 的 OS 级权限查询），直调至少与 macOS/Linux 旧行为一致且消灭误报。
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import {
  reminderActionLabels,
  type ReminderActionKind,
  type ReminderNotificationShell,
} from '@taskora/api';

/** 实时查询原生授权状态；命令返回 Option<bool>（Prompt 时为 null）。 */
async function isNativePermissionGranted(): Promise<boolean> {
  try {
    return (await invoke<boolean | null>('plugin:notification|is_permission_granted')) === true;
  } catch {
    return false;
  }
}

/**
 * 请求授权。直读原生命令返回值（native PermissionState），不经过
 * guest-js 的 web 缓存，无需像移动端那样事后复查。
 */
async function requestNativePermission(): Promise<boolean> {
  try {
    return (await invoke<string>('plugin:notification|request_permission')) === 'granted';
  } catch {
    return false;
  }
}

export function createDesktopNotificationShell(): ReminderNotificationShell {
  return {
    isSupported: () => true,
    isPermissionGranted: isNativePermissionGranted,
    requestPermission: requestNativePermission,
    async fireNow(reminder) {
      try {
        await invoke('show_reminder', {
          payload: {
            taskId: reminder.taskId,
            fireAt: reminder.fireAt,
            title: reminder.title,
            body: reminder.body,
            labels: reminderActionLabels(),
          },
        });
      } catch (error) {
        console.warn('[reminders] fireNow failed:', error);
      }
    },
    async openSettings() {
      await invoke('open_notification_settings');
    },
  };
}

/** 通知上的用户选择（Rust reminder_notification::ReminderActionEvent）。 */
export interface DesktopReminderAction {
  taskId: string;
  /** open = 点击正文（Rust 侧已唤出主窗口）。 */
  action: 'open' | ReminderActionKind;
  firedFireAt: number;
  tappedAt: number;
}

export async function onReminderAction(
  listener: (event: DesktopReminderAction) => void,
): Promise<() => void> {
  return listen<DesktopReminderAction>('reminder-action', (event) => listener(event.payload));
}
