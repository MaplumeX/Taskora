import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { invoke } from '@tauri-apps/api/core';

import { installSystemBarAppearance } from './system-bar-appearance';

const invokeMock = vi.fn<typeof invoke>();

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  vi.stubGlobal('__TAURI_INTERNALS__', {
    invoke: (command: string, args: Record<string, unknown>) => invokeMock(command, args),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
});

/** MutationObserver 回调是微任务。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const calls = () =>
  invokeMock.mock.calls
    .filter(([command]) => command === 'plugin:background|set_system_bar_appearance')
    .map(([, args]) => args);

describe('installSystemBarAppearance（系统栏图标明暗）', () => {
  it('启动时按当前主题设置一次', () => {
    document.documentElement.classList.add('dark');
    const cleanup = installSystemBarAppearance();
    expect(calls()).toEqual([{ dark: true }]);
    cleanup();
  });

  it('主题切换时跟随，class 其他变化不重复设置', async () => {
    const cleanup = installSystemBarAppearance();
    document.documentElement.classList.add('dark');
    await flush();
    document.documentElement.classList.add('unrelated');
    await flush();
    document.documentElement.classList.remove('dark');
    await flush();

    expect(calls()).toEqual([{ dark: false }, { dark: true }, { dark: false }]);
    document.documentElement.classList.remove('unrelated');
    cleanup();
  });

  it('清理后不再跟随', async () => {
    const cleanup = installSystemBarAppearance();
    cleanup();
    document.documentElement.classList.add('dark');
    await flush();
    expect(calls()).toEqual([{ dark: false }]);
  });

  it('不在 Tauri 下静默跳过', () => {
    vi.unstubAllGlobals();
    expect(() => installSystemBarAppearance()()).not.toThrow();
  });
});
