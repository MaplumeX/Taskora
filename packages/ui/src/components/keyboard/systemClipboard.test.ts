import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  invoke: vi.fn(),
  clientKind: 'desktop' as 'desktop' | 'web',
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: harness.invoke }));
vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getClientKind: () => harness.clientKind,
}));

import { readClipboardText, writeClipboardText } from './systemClipboard';

const browserClipboard = { readText: vi.fn(), writeText: vi.fn() };

beforeEach(() => {
  harness.invoke.mockReset();
  browserClipboard.readText.mockReset();
  browserClipboard.writeText.mockReset();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: browserClipboard });
});

afterEach(() => {
  delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe('桌面壳：原生剪贴板（tauri-plugin-clipboard-manager）', () => {
  beforeEach(() => {
    harness.clientKind = 'desktop';
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  });

  it('读写走插件命令，不碰 navigator.clipboard', async () => {
    harness.invoke.mockResolvedValueOnce('买牛奶');
    expect(await readClipboardText()).toBe('买牛奶');
    expect(harness.invoke).toHaveBeenCalledWith('plugin:clipboard-manager|read_text', undefined);

    await writeClipboardText('a\nb');
    expect(harness.invoke).toHaveBeenLastCalledWith('plugin:clipboard-manager|write_text', {
      text: 'a\nb',
    });
    expect(browserClipboard.readText).not.toHaveBeenCalled();
    expect(browserClipboard.writeText).not.toHaveBeenCalled();
  });

  it('剪贴板为空或不是文字时读到空字符串（确定不是 ⌘C 写入的内容）', async () => {
    harness.invoke.mockRejectedValueOnce(new Error('clipboard is empty'));
    expect(await readClipboardText()).toBe('');
  });
});

describe('Web：navigator.clipboard', () => {
  beforeEach(() => {
    harness.clientKind = 'web';
  });

  it('读写走 Clipboard API', async () => {
    browserClipboard.readText.mockResolvedValueOnce('x');
    expect(await readClipboardText()).toBe('x');
    await writeClipboardText('y');
    expect(browserClipboard.writeText).toHaveBeenCalledWith('y');
    expect(harness.invoke).not.toHaveBeenCalled();
  });

  it('被拒绝时读到 null（内容未知，回退到本机记下的条目）', async () => {
    browserClipboard.readText.mockRejectedValueOnce(new Error('denied'));
    expect(await readClipboardText()).toBeNull();
  });
});
