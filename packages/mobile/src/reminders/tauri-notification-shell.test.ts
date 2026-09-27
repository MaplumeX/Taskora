import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}));

import { createMobileNotificationShell } from './tauri-notification-shell';

/**
 * 命令名与参数形状必须与 reminders 插件（lib.rs 的 Rust 命令 + ACL）
 * 对齐：写错不会在 JS 侧报错，只会在真机上 ACL 拒绝或反序列化失败。
 */
describe('createMobileNotificationShell（reminders 插件）', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue(undefined);
  });

  it('sync 交付完整期望集与渠道名', async () => {
    const plan = [
      { key: 'reminder:t1', fireAt: 1_770_000_000_000, title: '写周报', body: '09:00' },
    ];
    await createMobileNotificationShell().sync!(plan);
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:reminders|sync', {
      args: { reminders: plan, channelName: expect.any(String) },
    });
  });

  it('sync 失败向上抛出，交给协调器下个 tick 重试', async () => {
    mocks.invoke.mockRejectedValue(new Error('ipc unavailable'));
    await expect(createMobileNotificationShell().sync!([])).rejects.toThrow('ipc unavailable');
  });

  it('clear 清空原生计划', async () => {
    await createMobileNotificationShell().clear!();
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:reminders|clear');
  });

  it('权限查询读原生 status，失败视为未授权', async () => {
    const shell = createMobileNotificationShell();
    mocks.invoke.mockResolvedValue({
      notifications: false,
      channelEnabled: true,
      exactAlarms: true,
      batteryUnrestricted: false,
    });
    await expect(shell.isPermissionGranted()).resolves.toBe(false);
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:reminders|status');

    mocks.invoke.mockRejectedValue(new Error('ipc unavailable'));
    await expect(shell.isPermissionGranted()).resolves.toBe(false);
  });

  it('请求授权直读插件返回值', async () => {
    const shell = createMobileNotificationShell();
    mocks.invoke.mockResolvedValue(true);
    await expect(shell.requestPermission()).resolves.toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:reminders|request_permission');

    mocks.invoke.mockRejectedValue(new Error('ipc unavailable'));
    await expect(shell.requestPermission()).resolves.toBe(false);
  });

  it('可靠性状态与系统设置跳转', async () => {
    const shell = createMobileNotificationShell();
    const status = {
      notifications: true,
      channelEnabled: true,
      exactAlarms: false,
      batteryUnrestricted: false,
    };
    mocks.invoke.mockResolvedValue(status);
    await expect(shell.reliability!()).resolves.toEqual(status);

    mocks.invoke.mockResolvedValue(undefined);
    await shell.openSystemSettings!('autostart');
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:reminders|open_settings', {
      target: 'autostart',
    });
    await shell.openSettings();
    expect(mocks.invoke).toHaveBeenCalledWith('open_notification_settings');
  });
});
