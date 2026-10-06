import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { invoke } from '@tauri-apps/api/core';
import { setSystemTheme, usePreferencesStore } from '@taskora/api';

import { installSystemTheme } from './system-theme';

const invokeMock = vi.fn<typeof invoke>();
let callbacks: Map<number, (raw: { index: number; message: unknown }) => void>;
let nextId: number;
let eventIndex: number;
let cleanup: (() => void) | undefined;

function stubTauri(dark: boolean) {
  invokeMock.mockImplementation(async (command) => {
    switch (command) {
      case 'plugin:background|register_listener':
      case 'plugin:background|remove_listener':
        return;
      case 'plugin:background|system_theme':
        return { dark };
      default:
        throw new Error(`Command ${command} not allowed by ACL`);
    }
  });
  vi.stubGlobal('__TAURI_INTERNALS__', {
    invoke: (command: string, args: Record<string, unknown>) => invokeMock(command, args),
    transformCallback: (cb: (raw: { index: number; message: unknown }) => void) => {
      const id = nextId++;
      callbacks.set(id, cb);
      return id;
    },
  });
}

/** 配置变化和 onResume 都经真实 Tauri Channel 投递同一种事件。 */
function triggerTheme(dark: boolean) {
  const registration = invokeMock.mock.calls.find(
    ([command, args]) =>
      command === 'plugin:background|register_listener' &&
      (args as Record<string, unknown> | undefined)?.event === 'theme',
  );
  expect(registration).toBeDefined();
  const handler = (registration![1] as Record<string, unknown>).handler as { id: number };
  callbacks.get(handler.id)!({ index: eventIndex++, message: { dark } });
}

beforeEach(() => {
  invokeMock.mockReset();
  callbacks = new Map();
  nextId = 1;
  eventIndex = 0;
  setSystemTheme(null);
  usePreferencesStore.getState().setTheme('system');
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  setSystemTheme(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('installSystemTheme', () => {
  it('启动读取原生主题，覆盖 WebView 保留的夜间值', async () => {
    const stale = { ...window.matchMedia('(prefers-color-scheme: dark)'), matches: true };
    vi.spyOn(window, 'matchMedia').mockReturnValue(stale);
    usePreferencesStore.getState().setTheme('system');
    expect(usePreferencesStore.getState().resolved).toBe('dark');
    stubTauri(false);

    cleanup = await installSystemTheme();
    expect(usePreferencesStore.getState()).toMatchObject({ theme: 'system', resolved: 'light' });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('系统切换或后台恢复的事件同步日间 / 夜间主题', async () => {
    stubTauri(true);
    cleanup = await installSystemTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    triggerTheme(false);
    expect(usePreferencesStore.getState().resolved).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    triggerTheme(true);
    expect(usePreferencesStore.getState().resolved).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('手动主题保持不变，改回跟随系统时采用最新原生值', async () => {
    stubTauri(false);
    usePreferencesStore.getState().setTheme('light');
    cleanup = await installSystemTheme();
    triggerTheme(true);
    expect(usePreferencesStore.getState()).toMatchObject({ theme: 'light', resolved: 'light' });
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    usePreferencesStore.getState().setTheme('system');
    expect(usePreferencesStore.getState().resolved).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('初始化期间收到的新主题不被旧查询结果覆盖', async () => {
    stubTauri(true);
    let finishRead!: (theme: { dark: boolean }) => void;
    invokeMock.mockImplementation(async (command) => {
      if (command === 'plugin:background|system_theme') {
        return new Promise((resolve) => {
          finishRead = resolve;
        });
      }
    });
    const installing = installSystemTheme();
    await vi.waitFor(() => expect(finishRead).toBeDefined());
    triggerTheme(false);
    finishRead({ dark: true });
    cleanup = await installing;
    expect(usePreferencesStore.getState().resolved).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('首次查询失败后仍能在回前台事件中恢复', async () => {
    stubTauri(false);
    invokeMock.mockImplementation(async (command) => {
      if (command === 'plugin:background|system_theme') throw new Error('temporarily unavailable');
    });
    cleanup = await installSystemTheme();
    triggerTheme(true);
    expect(usePreferencesStore.getState().resolved).toBe('dark');
    cleanup();
    cleanup = undefined;
    expect(
      invokeMock.mock.calls.some(([command]) => command === 'plugin:background|remove_listener'),
    ).toBe(true);
    expect(usePreferencesStore.getState().resolved).toBe('light');
  });

  it('浏览器预览使用媒体查询', async () => {
    cleanup = await installSystemTheme();
    expect(usePreferencesStore.getState()).toMatchObject({ theme: 'system', resolved: 'light' });
  });
});
