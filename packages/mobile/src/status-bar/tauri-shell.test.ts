import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { invoke } from '@tauri-apps/api/core';
import { Importance, type Channel } from '@tauri-apps/plugin-notification';

import { createTauriStatusBarShell } from './tauri-shell';
import { createMobileNotificationShell } from '../reminders/tauri-notification-shell';

// 保留真实的 notification JS API，才能捕获 channels() 命令名与 ACL
// 不匹配、sendNotification() 不返回原生 Promise 等跨层回归。
const invokeMock = vi.fn<typeof invoke>();
let existingChannels: Channel[];
let failCommand: string | null;
let notify: () => Promise<void>;

beforeEach(() => {
  existingChannels = [];
  failCommand = null;
  notify = async () => {};
  invokeMock.mockReset();
  vi.stubGlobal('__TAURI_INTERNALS__', {
    invoke: (command: string, args: Record<string, unknown>) =>
      Object.keys(args).length ? invokeMock(command, args) : invokeMock(command),
  });
  invokeMock.mockImplementation(async (command) => {
    if (command === failCommand) throw new Error(`failed: ${command}`);
    // 与插件默认 ACL 相同：listChannels 不在允许列表内。
    switch (command) {
      case 'plugin:notification|is_permission_granted':
        return true;
      case 'plugin:notification|list_channels':
        return existingChannels;
      case 'plugin:notification|create_channel':
      case 'plugin:notification|register_action_types':
      case 'plugin:notification|cancel':
        return;
      case 'plugin:notification|notify':
        return notify();
      default:
        throw new Error(`Command ${command} not allowed by ACL`);
    }
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('Android status bar notification bridge', () => {
  it('creates the LOW channel through allowed IPC before posting the ongoing entry', async () => {
    await createTauriStatusBarShell().post({ title: '快速添加任务' });

    expect(invokeMock.mock.calls.map(([command]) => command)).toEqual([
      'plugin:notification|list_channels',
      'plugin:notification|create_channel',
      'plugin:notification|register_action_types',
      'plugin:notification|notify',
    ]);
    expect(invokeMock).toHaveBeenCalledWith('plugin:notification|create_channel', {
      id: 'status-bar',
      name: expect.any(String),
      importance: Importance.Low,
    });
    expect(invokeMock).toHaveBeenCalledWith('plugin:notification|notify', {
      options: {
        id: 620001,
        channelId: 'status-bar',
        title: '快速添加任务',
        ongoing: true,
        actionTypeId: 'taskora-status-bar',
        autoCancel: false,
      },
    });
  });

  it.each([
    'plugin:notification|list_channels',
    'plugin:notification|create_channel',
    'plugin:notification|register_action_types',
  ])('does not post or poison retries after %s fails', async (command) => {
    const shell = createTauriStatusBarShell();
    failCommand = command;
    await expect(shell.post({ title: 'first' })).rejects.toThrow('failed:');
    expect(invokeMock.mock.calls.some(([cmd]) => cmd === 'plugin:notification|notify')).toBe(false);

    failCommand = null;
    await shell.post({ title: 'retry' });
    expect(invokeMock).toHaveBeenCalledWith('plugin:notification|notify', {
      options: expect.objectContaining({ title: 'retry' }),
    });
  });

  it('waits for the native result and propagates asynchronous post failures', async () => {
    let reject!: (reason: Error) => void;
    notify = () =>
      new Promise<void>((_, rejectPromise) => {
        reject = rejectPromise;
      });
    const result = createTauriStatusBarShell().post({ title: 'entry' });
    const rejected = expect(result).rejects.toThrow('native failure');
    await vi.waitFor(() => expect(reject).toBeTypeOf('function'));
    reject(new Error('native failure'));
    await rejected;
  });

  it('detects a channel disabled after a successful post and recovers when restored', async () => {
    const shell = createTauriStatusBarShell();
    const channel = { id: 'status-bar', name: 'Status bar', importance: Importance.Low };
    existingChannels = [channel];
    await shell.post({ title: 'first' });
    channel.importance = Importance.None;
    await expect(shell.post({ title: 'blocked' })).rejects.toThrow('channel is disabled');
    channel.importance = Importance.Low;
    await shell.post({ title: 'restored' });

    expect(
      invokeMock.mock.calls.filter(([cmd]) => cmd === 'plugin:notification|notify'),
    ).toHaveLength(2);
    // 不重建渠道以绕过用户设置；动作组成功后只注册一次。
    expect(
      invokeMock.mock.calls.filter(([cmd]) => cmd === 'plugin:notification|create_channel'),
    ).toHaveLength(0);
    expect(
      invokeMock.mock.calls.filter(([cmd]) => cmd === 'plugin:notification|register_action_types'),
    ).toHaveLength(1);
  });

  it('checks native permission instead of the cached Web Notification permission', async () => {
    expect(await createTauriStatusBarShell().isPermissionGranted()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('plugin:notification|is_permission_granted');
  });

  it('uses the corrected channel bridge for mobile reminders too', async () => {
    await createMobileNotificationShell().fireNow('Reminder', 'Task');
    expect(invokeMock).toHaveBeenCalledWith('plugin:notification|list_channels');
    expect(invokeMock).toHaveBeenCalledWith('plugin:notification|notify', {
      options: { channelId: 'reminders', title: 'Reminder', body: 'Task' },
    });
  });
});
