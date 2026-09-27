import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { invoke } from '@tauri-apps/api/core';
import { Importance, type Channel } from '@tauri-apps/plugin-notification';

import { createTauriStatusBarShell } from './tauri-shell';
import { createMobileNotificationShell } from '../reminders/tauri-notification-shell';

// 保留真实的 @tauri-apps/api 与 notification JS API，才能捕获 invoke 命令
// 名与 ACL 不匹配、addPluginListener 注册路径等跨层回归（issue 01 的传统）。
// transformCallback 是 addPluginListener 的 Channel 注册点：stub 成回调表，
// 测试借此模拟原生 trigger('action') 的真实投递路径。
const invokeMock = vi.fn<typeof invoke>();
let failCommand: string | null;
let channelCallbacks: Map<number, (raw: { index: number; message: unknown }) => void>;
let nextCallbackId: number;
let existingChannels: Channel[];

beforeEach(() => {
  failCommand = null;
  channelCallbacks = new Map();
  nextCallbackId = 1;
  existingChannels = [];
  invokeMock.mockReset();
  vi.stubGlobal('__TAURI_INTERNALS__', {
    invoke: (command: string, args: Record<string, unknown>) =>
      Object.keys(args).length ? invokeMock(command, args) : invokeMock(command),
    transformCallback: (cb: (raw: { index: number; message: unknown }) => void) => {
      const id = nextCallbackId++;
      channelCallbacks.set(id, cb);
      return id;
    },
  });
  invokeMock.mockImplementation(async (command) => {
    if (command === failCommand) throw new Error(`failed: ${command}`);
    switch (command) {
      case 'plugin:notification|is_permission_granted':
        return true;
      case 'plugin:notification|list_channels':
        return existingChannels;
      case 'plugin:notification|create_channel':
        return;
      case 'plugin:notification|notify':
        return;
      case 'plugin:statusbar|show':
      case 'plugin:statusbar|cancel':
      case 'plugin:statusbar|register_listener':
      case 'plugin:statusbar|remove_listener':
        return;
      default:
        throw new Error(`Command ${command} not allowed by ACL`);
    }
  });
});

afterEach(() => vi.unstubAllGlobals());

/** 提取 addPluginListener 注册的 Channel 回调，模拟原生 trigger 投递。 */
function registeredActionCallback(): (payload: unknown) => void {
  const registration = invokeMock.mock.calls.find(
    ([command]) => command === 'plugin:statusbar|register_listener',
  );
  expect(registration).toBeDefined();
  // Channel 实例（invoke 序列化发生在 mock 之后）：直接读 id。
  const handler = (registration![1] as Record<string, unknown>).handler as { id: number };
  const cb = channelCallbacks.get(handler.id);
  expect(cb).toBeTypeOf('function');
  // Channel 按 index 保序，乱序消息会被挂起：模拟原生侧的自增序号。
  let index = 0;
  return (payload) => cb!({ index: index++, message: payload });
}

describe('Android status bar plugin shell', () => {
  it('posts the title and injected labels to the statusbar plugin', async () => {
    await createTauriStatusBarShell().post({ title: '写周报' });

    expect(invokeMock).toHaveBeenCalledWith('plugin:statusbar|show', {
      args: {
        title: '写周报',
        channelName: expect.any(String),
        quickAddHint: expect.any(String),
        submitLabel: expect.any(String),
      },
    });
  });

  it('propagates show failures (e.g. channel disabled) so the controller rolls back', async () => {
    failCommand = 'plugin:statusbar|show';
    await expect(createTauriStatusBarShell().post({ title: 'entry' })).rejects.toThrow(
      'failed: plugin:statusbar|show',
    );
  });

  it('cancels the plugin notification and swallows missing-notification errors', async () => {
    const shell = createTauriStatusBarShell();
    await shell.clear();
    expect(invokeMock).toHaveBeenCalledWith('plugin:statusbar|cancel');

    failCommand = 'plugin:statusbar|cancel';
    await expect(shell.clear()).resolves.toBeUndefined();
  });

  it('forwards plugin action events with their quick-add input', async () => {
    const events: { actionId: string; inputValue?: string | null }[] = [];
    createTauriStatusBarShell().onAction((event) => events.push(event));
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledWith(
      'plugin:statusbar|register_listener',
      expect.objectContaining({ event: 'action' }),
    ));

    const trigger = registeredActionCallback();
    trigger({ action: 'next' });
    trigger({ action: 'quick-add', input: '写周报' });
    trigger({});

    expect(events).toEqual([
      { actionId: 'next', inputValue: null },
      { actionId: 'quick-add', inputValue: '写周报' },
      { actionId: 'tap', inputValue: null },
    ]);
  });

  it('checks native permission instead of the cached Web Notification permission', async () => {
    expect(await createTauriStatusBarShell().isPermissionGranted()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('plugin:notification|is_permission_granted');
  });

  it('keeps the corrected channel bridge for mobile reminders', async () => {
    await createMobileNotificationShell().fireNow('Reminder', 'Task');
    expect(invokeMock).toHaveBeenCalledWith('plugin:notification|list_channels');
    expect(invokeMock).toHaveBeenCalledWith('plugin:notification|notify', {
      options: { channelId: 'reminders', title: 'Reminder', body: 'Task' },
    });
  });

  it('reminder channel closure rejects posting and recovers when restored', async () => {
    const shell = createMobileNotificationShell();
    const channel = { id: 'reminders', name: 'Taskora', importance: Importance.High };
    existingChannels = [channel];
    await shell.fireNow('Reminder', 'Task');

    channel.importance = Importance.None;
    await shell.fireNow('Blocked', 'Task');
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'plugin:notification|notify')).toHaveLength(1);

    channel.importance = Importance.High;
    await shell.fireNow('Restored', 'Task');
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'plugin:notification|notify')).toHaveLength(2);
  });
});
