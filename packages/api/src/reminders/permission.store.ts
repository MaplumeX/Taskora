/**
 * 通知权限状态 store（reminders spec）。
 *
 * UI（ScheduledDateField 提醒区）经此读写授权状态；实际能力来自
 * NotificationShell（应用 boot 时注册，web 为 null → 整体不可用）。
 * 授权被拒不阻塞保存 reminderTime——只展示「通知已禁用」提示与
 * 跳转系统设置的入口。
 */

import { create } from 'zustand';

import { getNotificationShell } from './notification-shell';

export type ReminderPermissionState = 'unknown' | 'granted' | 'denied';

interface ReminderPermissionStore {
  permission: ReminderPermissionState;
  /** shell 未注册（web）时保持 unknown，UI 据此隐藏提醒区。 */
  supported: boolean;
  /** 从系统读取当前授权状态（boot / 提醒区打开时调用）。 */
  refresh(): Promise<void>;
  /** 首次开启提醒时请求授权；返回是否 granted。 */
  request(): Promise<boolean>;
  /** 跳转系统通知设置页。 */
  openSettings(): Promise<void>;
}

export const useReminderPermissionStore = create<ReminderPermissionStore>((set) => ({
  permission: 'unknown',
  supported: false,

  async refresh() {
    const shell = getNotificationShell();
    if (!shell || !shell.isSupported()) {
      set({ supported: false });
      return;
    }
    set({ supported: true });
    try {
      set({ permission: (await shell.isPermissionGranted()) ? 'granted' : 'denied' });
    } catch {
      set({ permission: 'denied' });
    }
  },

  async request() {
    const shell = getNotificationShell();
    if (!shell || !shell.isSupported()) {
      set({ supported: false });
      return false;
    }
    set({ supported: true });
    try {
      const granted = await shell.requestPermission();
      set({ permission: granted ? 'granted' : 'denied' });
      return granted;
    } catch {
      set({ permission: 'denied' });
      return false;
    }
  },

  async openSettings() {
    await getNotificationShell()?.openSettings().catch(() => undefined);
  },
}));
