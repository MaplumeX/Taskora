import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getNotificationShell,
  setNotificationShell,
  type ReminderNotificationShell,
} from './notification-shell';
import { useReminderPermissionStore } from './permission.store';

/**
 * 授权状态语义（reminders spec story 14/15）：
 * 「通知已禁用」提示只对询问过且被拒的用户展示；
 * isPermissionGranted() 的 false 同时含「尚未询问」，不得直接当 denied。
 */

function installShell(granted: boolean, requestResult: boolean) {
  const shell: ReminderNotificationShell = {
    isSupported: () => true,
    isPermissionGranted: vi.fn(async () => granted),
    requestPermission: vi.fn(async () => requestResult),
    schedule: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    fireNow: vi.fn(async () => {}),
    openSettings: vi.fn(async () => {}),
  };
  setNotificationShell(shell);
  return shell;
}

const ASKED_KEY = 'taskora.reminderPermissionAsked';

describe('useReminderPermissionStore — 未询问 ≠ 被拒', () => {
  beforeEach(() => {
    globalThis.localStorage?.removeItem(ASKED_KEY);
    useReminderPermissionStore.setState({ permission: 'unknown', supported: false });
  });

  afterEach(() => {
    setNotificationShell(null);
  });

  it('未询问（系统未授权且无 asked 标记）→ unknown，不显示禁用提示', async () => {
    installShell(false, false);
    await useReminderPermissionStore.getState().refresh();
    expect(useReminderPermissionStore.getState().permission).toBe('unknown');
    expect(useReminderPermissionStore.getState().supported).toBe(true);
  });

  it('已授权 → granted', async () => {
    installShell(true, true);
    await useReminderPermissionStore.getState().refresh();
    expect(useReminderPermissionStore.getState().permission).toBe('granted');
  });

  it('询问后被拒（asked 已持久化）→ denied；跨会话 refresh 仍 denied', async () => {
    installShell(false, false);
    await useReminderPermissionStore.getState().request();
    expect(useReminderPermissionStore.getState().permission).toBe('denied');
    expect(globalThis.localStorage?.getItem(ASKED_KEY)).toBe('1');

    // 模拟重启后（store 重置为 unknown）再次 refresh：asked 标记仍在
    useReminderPermissionStore.setState({ permission: 'unknown' });
    await useReminderPermissionStore.getState().refresh();
    expect(useReminderPermissionStore.getState().permission).toBe('denied');
  });

  it('请求被拒后拒绝态保留；下次开启仍会再次请求', async () => {
    const shell = installShell(false, false);
    await useReminderPermissionStore.getState().request();
    expect(shell.requestPermission).toHaveBeenCalledTimes(1);
    // 再次开启（如换任务）
    await useReminderPermissionStore.getState().request();
    expect(shell.requestPermission).toHaveBeenCalledTimes(2);
  });

  it('shell 未注册（web）→ supported=false，状态不动', async () => {
    setNotificationShell(null);
    await useReminderPermissionStore.getState().refresh();
    expect(useReminderPermissionStore.getState().supported).toBe(false);
    expect(useReminderPermissionStore.getState().permission).toBe('unknown');
    expect(getNotificationShell()).toBeNull();
  });
});
