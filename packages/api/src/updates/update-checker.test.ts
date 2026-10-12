import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SYNC_PROTOCOL_VERSION } from '@taskora/engine';

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn() },
}));

import { apiClient } from '@/api/client';
import { setSyncStatus } from '@/stores/sync-status.store';
import { setAppVersion } from '@/utils/appInfo';
import {
  checkForUpdates,
  initUpdateChecks,
  selectPendingUpdate,
  setUpdateShell,
  useUpdateStore,
  type UpdateShell,
} from './update-checker';

const HOUR = 60 * 60_000;

function hubAt(version: string, protocol = SYNC_PROTOCOL_VERSION) {
  vi.mocked(apiClient.get).mockResolvedValue({
    data: { status: 'ok', version, protocolVersion: protocol, minProtocolVersion: protocol },
  });
}

let shell: UpdateShell & { prepare: ReturnType<typeof vi.fn>; apply: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  setAppVersion('0.9.0');
  shell = {
    action: 'restart',
    prepare: vi.fn(async () => true),
    apply: vi.fn(async () => undefined),
  };
  setUpdateShell(shell);
  useUpdateStore.setState({
    autoCheck: true,
    skippedVersion: null,
    lastCheckedAt: null,
    verdict: null,
    readyVersion: null,
    checking: false,
    failed: false,
  });
  setSyncStatus('idle');
});

afterEach(() => {
  vi.useRealTimers();
  setUpdateShell(null);
});

describe('checkForUpdates', () => {
  it('查询 hub 的 /health，有新版本时让平台壳准备该版本', async () => {
    hubAt('0.10.0');

    await checkForUpdates();

    expect(apiClient.get).toHaveBeenCalledWith('/health');
    expect(shell.prepare).toHaveBeenCalledWith('0.10.0');
    const state = useUpdateStore.getState();
    expect(state.verdict).toEqual({ kind: 'update-available', hubVersion: '0.10.0' });
    expect(state.readyVersion).toBe('0.10.0');
    expect(selectPendingUpdate(state)).toEqual({ version: '0.10.0', required: false });
  });

  it('已是最新：不准备安装包', async () => {
    hubAt('0.9.0');
    await checkForUpdates();
    expect(shell.prepare).not.toHaveBeenCalled();
    expect(selectPendingUpdate(useUpdateStore.getState())).toBeNull();
  });

  it('本平台没有该版本的安装包：不提示，下次再查', async () => {
    hubAt('0.10.0');
    shell.prepare.mockResolvedValueOnce(false);
    await checkForUpdates();
    expect(useUpdateStore.getState().readyVersion).toBeNull();
    expect(selectPendingUpdate(useUpdateStore.getState())).toBeNull();
  });

  it('跳过的版本：自动检查不准备也不提示；手动检查重新提示', async () => {
    hubAt('0.10.0');
    useUpdateStore.getState().skipVersion('0.10.0');

    await checkForUpdates();
    expect(shell.prepare).not.toHaveBeenCalled();
    expect(selectPendingUpdate(useUpdateStore.getState())).toBeNull();

    await checkForUpdates({ manual: true });
    expect(shell.prepare).toHaveBeenCalledWith('0.10.0');
    expect(selectPendingUpdate(useUpdateStore.getState())).toEqual({
      version: '0.10.0',
      required: false,
    });
  });

  it('client-too-old 不可跳过', async () => {
    hubAt('1.0.0', SYNC_PROTOCOL_VERSION + 1);
    useUpdateStore.getState().skipVersion('1.0.0');

    await checkForUpdates();

    expect(shell.prepare).toHaveBeenCalledWith('1.0.0');
    expect(selectPendingUpdate(useUpdateStore.getState())).toEqual({
      version: '1.0.0',
      required: true,
    });
  });

  it('网络失败：保留上次结论，标记失败', async () => {
    hubAt('0.10.0');
    await checkForUpdates();
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));

    await checkForUpdates();

    const state = useUpdateStore.getState();
    expect(state.failed).toBe(true);
    expect(state.verdict).toEqual({ kind: 'update-available', hubVersion: '0.10.0' });
    expect(state.checking).toBe(false);
  });

  it('未注册平台壳（web）：什么都不做', async () => {
    setUpdateShell(null);
    await checkForUpdates();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('并发调用合并为一次请求', async () => {
    hubAt('0.9.0');
    await Promise.all([checkForUpdates(), checkForUpdates()]);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });
});

describe('initUpdateChecks（调度）', () => {
  it('启动延迟后检查一次，之后满 24 小时再查', async () => {
    vi.useFakeTimers();
    hubAt('0.9.0');
    const stop = initUpdateChecks({ startDelayMs: 10_000 });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(apiClient.get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(apiClient.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(23 * HOUR);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    stop();
  });

  it('关闭自动检查：不按时检查', async () => {
    vi.useFakeTimers();
    hubAt('0.9.0');
    useUpdateStore.getState().setAutoCheck(false);
    const stop = initUpdateChecks({ startDelayMs: 10_000 });

    await vi.advanceTimersByTimeAsync(48 * HOUR);
    expect(apiClient.get).not.toHaveBeenCalled();
    stop();
  });

  it('同步被 hub 以 426 拒绝：立即检查，拿到必须更新的目标版本', async () => {
    vi.useFakeTimers();
    hubAt('1.0.0', SYNC_PROTOCOL_VERSION + 1);
    const stop = initUpdateChecks({ startDelayMs: 10_000 });

    setSyncStatus('upgrade-required');
    await vi.advanceTimersByTimeAsync(0);

    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(selectPendingUpdate(useUpdateStore.getState())).toEqual({
      version: '1.0.0',
      required: true,
    });
    stop();
  });

  it('停止后不再检查', async () => {
    vi.useFakeTimers();
    hubAt('0.9.0');
    const stop = initUpdateChecks({ startDelayMs: 10_000 });
    stop();
    await vi.advanceTimersByTimeAsync(48 * HOUR);
    setSyncStatus('upgrade-required');
    await vi.advanceTimersByTimeAsync(0);
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
