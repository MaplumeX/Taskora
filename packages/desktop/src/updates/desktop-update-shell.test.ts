import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

const engineMocks = vi.hoisted(() => ({ flushBeforeRestart: vi.fn(async () => undefined) }));
vi.mock('../engine/desktop-engine', () => engineMocks);

import { desktopUpdateShell } from './desktop-update-shell';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('desktopUpdateShell（ADR-0026）', () => {
  it('准备：交给壳层按 hub 版本下载', async () => {
    invoke.mockResolvedValueOnce(true);
    await expect(desktopUpdateShell.prepare('0.10.0')).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith('update_prepare', { version: '0.10.0' });
  });

  it('安装：先推送本地待同步的修改，再安装并重启', async () => {
    const order: string[] = [];
    engineMocks.flushBeforeRestart.mockImplementationOnce(async () => {
      order.push('flush');
    });
    invoke.mockImplementationOnce(async (command: string) => {
      order.push(command);
    });

    await desktopUpdateShell.apply('0.10.0');

    expect(order).toEqual(['flush', 'update_apply']);
    expect(invoke).toHaveBeenCalledWith('update_apply', { version: '0.10.0' });
  });

  it('安装失败：错误交给提示条显示', async () => {
    invoke.mockRejectedValueOnce('signature mismatch');
    await expect(desktopUpdateShell.apply('0.10.0')).rejects.toBe('signature mismatch');
  });
});
