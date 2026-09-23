/**
 * 通知权限状态 store（reminders spec）。
 *
 * UI（ScheduledDateField 提醒区）经此读写授权状态；实际能力来自
 * NotificationShell（应用 boot 时注册，web 为 null → 整体不可用）。
 *
 * 授权被拒不阻塞保存 reminderTime——只展示「通知已禁用」提示与跳转
 * 系统设置的入口。提示只对「询问过且被拒」的用户展示（spec story
 * 14/15）：isPermissionGranted() 的 false 同时意味着「尚未询问」
 * （Windows / Android 13+），因此以本地持久化的 asked 标记区分。
 */

import { create } from 'zustand';

import { getNotificationShell } from './notification-shell';

export type ReminderPermissionState = 'unknown' | 'granted' | 'denied';

const ASKED_KEY = 'taskora.reminderPermissionAsked';

function readAsked(): boolean {
  try {
    return globalThis.localStorage?.getItem(ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeAsked(asked: boolean): void {
  try {
    globalThis.localStorage?.setItem(ASKED_KEY, asked ? '1' : '0');
  } catch {
    // localStorage 不可用（隐私模式等）：退化为会话内记忆
  }
}

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
      if (await shell.isPermissionGranted()) {
        set({ permission: 'granted' });
      } else {
        // false ≠ 拒绝：也可能是从未询问。只有询问过（本机持久化标记）
        // 才展示「已禁用」提示，避免对从未被询问的用户预弹提示。
        set({ permission: readAsked() ? 'denied' : 'unknown' });
      }
    } catch {
      set({ permission: 'unknown' });
    }
  },

  async request() {
    const shell = getNotificationShell();
    if (!shell || !shell.isSupported()) {
      set({ supported: false });
      return false;
    }
    set({ supported: true });
    writeAsked(true); // 询问过的事实先落盘（用户关闭弹窗也算询问）
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
