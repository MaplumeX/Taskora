import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { invoke } from '@tauri-apps/api/core';

import { createTauriStatusBarShell } from './tauri-shell';

// 保留真实的 @tauri-apps/api，才能捕获 invoke 命令
// 名与 ACL 不匹配、addPluginListener 注册路径等跨层回归（issue 01 的传统）。
// transformCallback 是 addPluginListener 的 Channel 注册点：stub 成回调表，
// 测试借此模拟原生 trigger('action') 的真实投递路径。
const invokeMock = vi.fn<typeof invoke>();
let failCommand: string | null;
let channelCallbacks: Map<number, (raw: { index: number; message: unknown }) => void>;
let nextCallbackId: number;

beforeEach(() => {
  failCommand = null;
  channelCallbacks = new Map();
  nextCallbackId = 1;
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
      case 'plugin:reminders|status':
        return {
          notifications: true,
          channelEnabled: true,
          exactAlarms: true,
          batteryUnrestricted: true,
        };
      case 'plugin:reminders|request_permission':
        return true;
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
    const shell = createTauriStatusBarShell();
    expect(await shell.isPermissionGranted()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('plugin:reminders|status');
    expect(await shell.requestPermission()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('plugin:reminders|request_permission');
  });

  it('treats a failing permission query as not granted', async () => {
    failCommand = 'plugin:reminders|status';
    expect(await createTauriStatusBarShell().isPermissionGranted()).toBe(false);
  });
});
