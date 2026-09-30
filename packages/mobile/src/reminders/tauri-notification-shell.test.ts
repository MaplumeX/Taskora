import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  addPluginListener: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  addPluginListener: mocks.addPluginListener,
}));

import {
  configureBackgroundSync,
  createMobileNotificationShell,
  onOpenTask,
  takeLaunchTask,
} from './tauri-notification-shell';

/**
 * 命令名与参数形状必须与 reminders 插件（lib.rs 的 Rust 命令 + ACL）
 * 对齐：写错不会在 JS 侧报错，只会在真机上 ACL 拒绝或反序列化失败。
 */
describe('createMobileNotificationShell（reminders 插件）', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue(undefined);
  });

  it('sync 交付完整期望集、渠道名与通知按钮文案', async () => {
    const plan = [
      {
        key: 'reminder:t1',
        taskId: 't1',
        fireAt: 1_770_000_000_000,
        snoozeTomorrowAt: 1_770_086_400_000,
        title: '写周报',
        body: '09:00',
      },
    ];
    await createMobileNotificationShell().sync!(plan, { cursor: 7, pendingLocal: false });
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:reminders|sync', {
      args: {
        reminders: plan,
        channelName: expect.any(String),
        labels: {
          complete: expect.any(String),
          snooze: expect.any(String),
          snooze15: expect.any(String),
          snooze60: expect.any(String),
          snoozeTomorrow: expect.any(String),
          snoozeMore: expect.any(String),
        },
        basis: { cursor: 7, pendingLocal: false },
      },
    });
  });

  it('后台同步：计划地址与后台凭据交给原生（issue 09）', async () => {
    await configureBackgroundSync('https://taskora.example.com/api/v1/reminders/plan', 'bg');
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:reminders|configure_background', {
      args: { planUrl: 'https://taskora.example.com/api/v1/reminders/plan', token: 'bg' },
    });
  });

  it('取走原生排队的通知操作', async () => {
    const actions = [{ taskId: 't1', action: 'complete', firedFireAt: 1, tappedAt: 2 }];
    mocks.invoke.mockResolvedValue(actions);
    await expect(createMobileNotificationShell().takePendingActions!()).resolves.toEqual(actions);
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:reminders|take_pending_actions');
  });

  it('订阅原生事件：actions-available / open-task，注销走 unregister', async () => {
    const unregister = vi.fn(async () => {});
    mocks.addPluginListener.mockResolvedValue({ unregister });
    const listener = vi.fn();

    const offActions = await createMobileNotificationShell().onActionsAvailable!(listener);
    expect(mocks.addPluginListener).toHaveBeenCalledWith(
      'reminders',
      'actions-available',
      listener,
    );
    const offOpen = await onOpenTask(listener);
    expect(mocks.addPluginListener).toHaveBeenCalledWith('reminders', 'open-task', listener);

    offActions();
    offOpen();
    expect(unregister).toHaveBeenCalledTimes(2);
  });

  it('取走点通知正文启动时携带的任务', async () => {
    mocks.invoke.mockResolvedValue('t1');
    await expect(takeLaunchTask()).resolves.toBe('t1');
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:reminders|take_launch_task');
  });

  it('sync 失败向上抛出，交给协调器下个 tick 重试', async () => {
    mocks.invoke.mockRejectedValue(new Error('ipc unavailable'));
    await expect(
      createMobileNotificationShell().sync!([], { cursor: 0, pendingLocal: false }),
    ).rejects.toThrow('ipc unavailable');
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
