import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { invoke } from '@tauri-apps/api/core';

import { installSafeAreaInsets } from './safe-area-insets';

// 保留真实的 @tauri-apps/api（同 status-bar/tauri-shell.test.ts）：命令名
// 与 addPluginListener 的注册路径都走真实实现，捕获与 ACL 的跨层回归。
const invokeMock = vi.fn<typeof invoke>();
let channelCallbacks: Map<number, (raw: { index: number; message: unknown }) => void>;
let nextCallbackId: number;

function stubTauri(insets: { top: number; bottom: number }) {
  invokeMock.mockImplementation(async (command) => {
    switch (command) {
      case 'plugin:background|register_listener':
      case 'plugin:background|remove_listener':
        return;
      case 'plugin:background|safe_area_insets':
        return insets;
      default:
        throw new Error(`Command ${command} not allowed by ACL`);
    }
  });
  vi.stubGlobal('__TAURI_INTERNALS__', {
    invoke: (command: string, args: Record<string, unknown>) =>
      Object.keys(args).length ? invokeMock(command, args) : invokeMock(command),
    transformCallback: (cb: (raw: { index: number; message: unknown }) => void) => {
      const id = nextCallbackId++;
      channelCallbacks.set(id, cb);
      return id;
    },
  });
}

/** 模拟原生 trigger('insets') 投递。 */
function triggerInsets(payload: { top: number; bottom: number }) {
  const registration = invokeMock.mock.calls.find(
    ([command, args]) =>
      command === 'plugin:background|register_listener' &&
      (args as Record<string, unknown> | undefined)?.event === 'insets',
  );
  expect(registration).toBeDefined();
  const handler = (registration![1] as Record<string, unknown>).handler as { id: number };
  channelCallbacks.get(handler.id)!({ index: 0, message: payload });
}

const style = () => document.documentElement.style;

beforeEach(() => {
  invokeMock.mockReset();
  channelCallbacks = new Map();
  nextCallbackId = 1;
});

afterEach(() => {
  vi.unstubAllGlobals();
  style().removeProperty('--native-safe-top');
  style().removeProperty('--native-safe-bottom');
});

describe('installSafeAreaInsets（系统栏安全区）', () => {
  it('启动时取一次原生 insets 写入 CSS 变量，清理时移除', async () => {
    stubTauri({ top: 24, bottom: 16 });
    const cleanup = await installSafeAreaInsets();

    expect(style().getPropertyValue('--native-safe-top')).toBe('24px');
    expect(style().getPropertyValue('--native-safe-bottom')).toBe('16px');

    cleanup();
    expect(style().getPropertyValue('--native-safe-top')).toBe('');
    expect(style().getPropertyValue('--native-safe-bottom')).toBe('');
  });

  it('原生推送的变化（旋转 / 切换手势导航）覆盖当前值', async () => {
    stubTauri({ top: 24, bottom: 48 });
    await installSafeAreaInsets();

    triggerInsets({ top: 0, bottom: 16 });

    expect(style().getPropertyValue('--native-safe-top')).toBe('0px');
    expect(style().getPropertyValue('--native-safe-bottom')).toBe('16px');
  });

  it('不在 Tauri 下静默跳过', async () => {
    const cleanup = await installSafeAreaInsets();
    expect(style().getPropertyValue('--native-safe-top')).toBe('');
    expect(() => cleanup()).not.toThrow();
  });
});
