import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { invoke } from '@tauri-apps/api/core';
import { haptic, useUndoPromptStore } from '@taskora/api';

import { installGestures } from './gestures';

const invokeMock = vi.fn<typeof invoke>();
let callbacks: Map<number, (raw: { index: number; message: unknown }) => void>;
let nextId: number;
let eventIndex: number;
let cleanup: (() => void) | undefined;

function stubTauri() {
  invokeMock.mockImplementation(async (command) => {
    switch (command) {
      case 'plugin:background|register_listener':
      case 'plugin:background|remove_listener':
      case 'plugin:background|haptic':
        return;
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

/** 原生检测到摇晃：经 Tauri Channel 投递 `shake` 事件。 */
function triggerShake() {
  const registration = invokeMock.mock.calls.find(
    ([command, args]) =>
      command === 'plugin:background|register_listener' &&
      (args as Record<string, unknown> | undefined)?.event === 'shake',
  );
  expect(registration).toBeDefined();
  const handler = (registration![1] as Record<string, unknown>).handler as { id: number };
  callbacks.get(handler.id)!({ index: eventIndex++, message: {} });
}

beforeEach(() => {
  invokeMock.mockReset();
  callbacks = new Map();
  nextId = 1;
  eventIndex = 0;
  useUndoPromptStore.setState({ open: false });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('installGestures', () => {
  it('触感经 background 插件触发', async () => {
    stubTauri();
    cleanup = await installGestures();

    haptic('lift');
    expect(invokeMock).toHaveBeenCalledWith('plugin:background|haptic', { kind: 'lift' });
  });

  it('摇一摇请求撤销确认；已有弹层时不叠加', async () => {
    stubTauri();
    cleanup = await installGestures();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('data-state', 'open');
    document.body.appendChild(dialog);
    triggerShake();
    expect(useUndoPromptStore.getState().open).toBe(false);

    dialog.remove();
    triggerShake();
    expect(useUndoPromptStore.getState().open).toBe(true);
  });

  it('卸载后触感回到 no-op', async () => {
    stubTauri();
    cleanup = await installGestures();
    cleanup();
    cleanup = undefined;

    haptic('tick');
    expect(invokeMock).not.toHaveBeenCalledWith('plugin:background|haptic', expect.anything());
  });
});
