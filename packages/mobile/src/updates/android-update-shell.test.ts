import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openUrl = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }));

import { androidUpdateShell } from './android-update-shell';

const fetchMock = vi.fn();

function release(assets: string[], ok = true) {
  fetchMock.mockResolvedValueOnce({
    ok,
    json: async () => ({ assets: assets.map((name) => ({ name })) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('androidUpdateShell（ADR-0026）', () => {
  it('准备：查询 hub 版本对应的 Release，带 APK 才算可用', async () => {
    release(['Taskora-v0.10.0.apk', 'Taskora_0.10.0_amd64.AppImage']);

    await expect(androidUpdateShell.prepare('0.10.0')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/MaplumeX/Taskora/releases/tags/v0.10.0',
      expect.objectContaining({ headers: expect.anything() }),
    );
  });

  it('Release 还没有 APK（构建失败 / 尚未补发）：暂不提示', async () => {
    release(['Taskora_0.10.0_amd64.AppImage']);
    await expect(androidUpdateShell.prepare('0.10.0')).resolves.toBe(false);
  });

  it('Release 不存在：暂不提示', async () => {
    release([], false);
    await expect(androidUpdateShell.prepare('0.10.0')).resolves.toBe(false);
  });

  it('下载：用系统浏览器打开 APK', async () => {
    await androidUpdateShell.apply('0.10.0');
    expect(openUrl).toHaveBeenCalledWith(
      'https://github.com/MaplumeX/Taskora/releases/download/v0.10.0/Taskora-v0.10.0.apk',
    );
  });

  it('按钮是下载而不是重启', () => {
    expect(androidUpdateShell.action).toBe('download');
  });
});
