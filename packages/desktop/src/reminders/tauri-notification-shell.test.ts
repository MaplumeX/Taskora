import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mocks.listen,
}));

import { createDesktopNotificationShell, onReminderAction } from './tauri-notification-shell';

/**
 * 权限检测必须直调原生命令、不经过 guest-js 的 window.Notification 缓存
 * （Windows 上该缓存启动即被初始化成 'denied'，造成「已禁用」误报）。
 */
describe('createDesktopNotificationShell 权限检测', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  it('isPermissionGranted 直查原生命令，true → granted', async () => {
    mocks.invoke.mockResolvedValue(true);
    const shell = createDesktopNotificationShell();
    await expect(shell.isPermissionGranted()).resolves.toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:notification|is_permission_granted');
  });

  it('isPermissionGranted：原生命令返回 null（Prompt）视为未授权', async () => {
    mocks.invoke.mockResolvedValue(null);
    const shell = createDesktopNotificationShell();
    await expect(shell.isPermissionGranted()).resolves.toBe(false);
  });

  it('isPermissionGranted：命令失败返回 false 而不抛出', async () => {
    mocks.invoke.mockRejectedValue(new Error('ipc unavailable'));
    const shell = createDesktopNotificationShell();
    await expect(shell.isPermissionGranted()).resolves.toBe(false);
  });

  it('requestPermission 直读原生命令返回值，granted → true', async () => {
    mocks.invoke.mockResolvedValue('granted');
    const shell = createDesktopNotificationShell();
    await expect(shell.requestPermission()).resolves.toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:notification|request_permission');
  });

  it('requestPermission：非 granted 或失败均返回 false', async () => {
    const shell = createDesktopNotificationShell();
    mocks.invoke.mockResolvedValue('denied');
    await expect(shell.requestPermission()).resolves.toBe(false);
    mocks.invoke.mockRejectedValue(new Error('ipc unavailable'));
    await expect(shell.requestPermission()).resolves.toBe(false);
  });
});

describe('createDesktopNotificationShell fireNow', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  const reminder = {
    key: 'reminder:t1',
    taskId: 't1',
    fireAt: 1_770_000_000_000,
    snoozeTomorrowAt: 1_770_086_400_000,
    title: '写周报',
    body: '09:00 · 工作',
  };

  it('走 show_reminder 命令：带 taskId / fireAt 与当前语言的按钮文案', async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await createDesktopNotificationShell().fireNow!(reminder);
    expect(mocks.invoke).toHaveBeenCalledWith('show_reminder', {
      payload: {
        taskId: 't1',
        fireAt: 1_770_000_000_000,
        title: '写周报',
        body: '09:00 · 工作',
        labels: expect.objectContaining({
          complete: expect.any(String),
          snooze15: expect.any(String),
          snooze60: expect.any(String),
          snoozeTomorrow: expect.any(String),
        }),
      },
    });
  });

  it('发送失败被 catch 并告警，不向外抛出', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.invoke.mockRejectedValue(new Error('notify failed'));
    await expect(createDesktopNotificationShell().fireNow!(reminder)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('onReminderAction', () => {
  it('订阅 reminder-action 事件并交出 payload', async () => {
    const unlisten = vi.fn();
    mocks.listen.mockResolvedValue(unlisten);
    const listener = vi.fn();

    const off = await onReminderAction(listener);
    expect(mocks.listen).toHaveBeenCalledWith('reminder-action', expect.any(Function));
    const payload = { taskId: 't1', action: 'complete', firedFireAt: 1, tappedAt: 2 };
    mocks.listen.mock.calls[0][1]({ payload });
    expect(listener).toHaveBeenCalledWith(payload);
    expect(off).toBe(unlisten);
  });
});
