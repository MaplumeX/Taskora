import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SYNC_PROTOCOL_VERSION } from '@taskora/engine';

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

import { apiClient, setApiBaseUrl } from '@/api/client';
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
const FIVE_MINUTES = 5 * 60_000;
const stops: Array<() => void> = [];

function startChecks() {
  const stop = initUpdateChecks();
  stops.push(stop);
  return stop;
}

function hubAt(version: string, protocol = SYNC_PROTOCOL_VERSION) {
  vi.mocked(apiClient.get).mockResolvedValue({
    data: { status: 'ok', version, protocolVersion: protocol, minProtocolVersion: protocol },
  });
}

let shell: UpdateShell & { prepare: ReturnType<typeof vi.fn>; apply: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  setApiBaseUrl('https://first.example/api/v1');
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
  for (const stop of stops.splice(0)) stop();
  vi.restoreAllMocks();
  vi.useRealTimers();
  setUpdateShell(null);
});

describe('checkForUpdates', () => {
  it('查询 hub 的 /health，有新版本时让平台壳准备该版本', async () => {
    hubAt('0.10.0');

    await checkForUpdates();

    expect(apiClient.get).toHaveBeenCalledWith('/health', {
      baseURL: 'https://first.example/api/v1',
      timeout: 15_000,
    });
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

  it('重复检查复用准备好的安装包，服务器版本变化时准备新版本', async () => {
    hubAt('0.10.0');
    await checkForUpdates();
    useUpdateStore.getState().skipVersion('0.10.0');
    await checkForUpdates();
    await checkForUpdates({ manual: true });
    expect(shell.prepare).toHaveBeenCalledTimes(1);
    expect(useUpdateStore.getState().readyVersion).toBe('0.10.0');

    hubAt('0.11.0');
    await checkForUpdates();
    expect(shell.prepare).toHaveBeenCalledTimes(2);
    expect(shell.prepare).toHaveBeenLastCalledWith('0.11.0');
  });

  it('安装包暂未发布时，下次检查重新准备', async () => {
    hubAt('0.10.0');
    shell.prepare.mockResolvedValueOnce(false);
    await checkForUpdates();
    await checkForUpdates();
    expect(shell.prepare).toHaveBeenCalledTimes(2);
    expect(useUpdateStore.getState().readyVersion).toBe('0.10.0');
  });
});

describe('initUpdateChecks（调度）', () => {
  it('启动延迟后检查一次，每小时发现服务器的新版本', async () => {
    vi.useFakeTimers();
    hubAt('0.9.0');
    const stop = startChecks();

    await vi.advanceTimersByTimeAsync(9_999);
    expect(apiClient.get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(apiClient.get).toHaveBeenCalledTimes(1);

    hubAt('0.10.0');
    await vi.advanceTimersByTimeAsync(HOUR - 10_001);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(selectPendingUpdate(useUpdateStore.getState())?.version).toBe('0.10.0');
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(apiClient.get).toHaveBeenCalledTimes(3);
    expect(shell.prepare).toHaveBeenCalledTimes(1);
    stop();
  });

  it('关闭自动检查：不按时检查', async () => {
    vi.useFakeTimers();
    hubAt('0.9.0');
    useUpdateStore.getState().setAutoCheck(false);
    const stop = startChecks();

    await vi.advanceTimersByTimeAsync(48 * HOUR);
    expect(apiClient.get).not.toHaveBeenCalled();
    stop();
  });

  it('同步被 hub 以 426 拒绝：立即检查，拿到必须更新的目标版本', async () => {
    vi.useFakeTimers();
    hubAt('1.0.0', SYNC_PROTOCOL_VERSION + 1);
    const stop = startChecks();

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
    const stop = startChecks();
    stop();
    await vi.advanceTimersByTimeAsync(48 * HOUR);
    setSyncStatus('upgrade-required');
    await vi.advanceTimersByTimeAsync(0);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it.each(['focus', 'visibilitychange', 'online'])(
    '%s：满 5 分钟检查，重复事件不重复请求',
    async (event) => {
      vi.useFakeTimers();
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      hubAt('0.9.0');
      startChecks();
      await vi.advanceTimersByTimeAsync(10_000);
      const target = event === 'visibilitychange' ? document : window;
      target.dispatchEvent(new Event(event));
      await vi.advanceTimersByTimeAsync(0);
      expect(apiClient.get).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(FIVE_MINUTES);
      hubAt('0.10.0');
      target.dispatchEvent(new Event(event));
      await vi.advanceTimersByTimeAsync(0);
      expect(apiClient.get).toHaveBeenCalledTimes(2);
      expect(useUpdateStore.getState().readyVersion).toBe('0.10.0');
      target.dispatchEvent(new Event(event));
      await vi.advanceTimersByTimeAsync(0);
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    },
  );

  it('后台 visibilitychange 和 focus 不检查', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    hubAt('0.9.0');
    startChecks();
    await vi.advanceTimersByTimeAsync(10_000 + FIVE_MINUTES);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('恢复网络失败也节流，手动检查可立即重试', async () => {
    vi.useFakeTimers();
    hubAt('0.9.0');
    startChecks();
    await vi.advanceTimersByTimeAsync(10_000 + FIVE_MINUTES);
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(useUpdateStore.getState().failed).toBe(true);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    await checkForUpdates({ manual: true });
    expect(apiClient.get).toHaveBeenCalledTimes(3);
    expect(useUpdateStore.getState().failed).toBe(false);
  });

  it('切换服务器立即清除旧提示并检查，同地址设置不触发', async () => {
    vi.useFakeTimers();
    hubAt('0.10.0');
    startChecks();
    await vi.advanceTimersByTimeAsync(10_000);
    hubAt('0.9.0');
    setApiBaseUrl('https://second.example/api/v1');
    expect(selectPendingUpdate(useUpdateStore.getState())).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(apiClient.get).toHaveBeenLastCalledWith('/health', {
      baseURL: 'https://second.example/api/v1',
      timeout: 15_000,
    });
    expect(useUpdateStore.getState().verdict?.kind).toBe('up-to-date');
    setApiBaseUrl('https://second.example/api/v1');
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('切换服务器时丢弃旧请求结果，随后检查新服务器', async () => {
    vi.useFakeTimers();
    hubAt('0.9.0');
    let resolveOld!: (response: { data: { version: string } }) => void;
    vi.mocked(apiClient.get).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    startChecks();
    await vi.advanceTimersByTimeAsync(10_000);
    setApiBaseUrl('https://second.example/api/v1');
    resolveOld({ data: { version: '0.10.0' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(shell.prepare).not.toHaveBeenCalled();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(useUpdateStore.getState().verdict?.kind).toBe('up-to-date');
  });

  it('切换服务器时串行准备安装包，旧下载不覆盖新服务器提示', async () => {
    vi.useFakeTimers();
    hubAt('0.10.0');
    let finishOldDownload!: (ready: boolean) => void;
    shell.prepare.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldDownload = resolve;
        }),
    );
    startChecks();
    await vi.advanceTimersByTimeAsync(10_000);
    hubAt('0.11.0');
    setApiBaseUrl('https://second.example/api/v1');
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(useUpdateStore.getState().readyVersion).toBeNull();
    finishOldDownload(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(shell.prepare.mock.calls).toEqual([['0.10.0'], ['0.11.0']]);
    expect(selectPendingUpdate(useUpdateStore.getState())?.version).toBe('0.11.0');
  });

  it('关闭自动检查后所有事件均不检查，手动检查仍可用', async () => {
    vi.useFakeTimers();
    hubAt('0.9.0');
    useUpdateStore.getState().setAutoCheck(false);
    startChecks();
    setApiBaseUrl('https://second.example/api/v1');
    setSyncStatus('upgrade-required');
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(apiClient.get).not.toHaveBeenCalled();
    await checkForUpdates({ manual: true });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('停止后移除服务器和前台监听，也取消等待中的切换检查', async () => {
    vi.useFakeTimers();
    hubAt('0.9.0');
    let resolveOld!: (response: { data: { version: string } }) => void;
    vi.mocked(apiClient.get).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const stop = startChecks();
    await vi.advanceTimersByTimeAsync(10_000);
    setApiBaseUrl('https://second.example/api/v1');
    stop();
    resolveOld({ data: { version: '0.10.0' } });
    await vi.advanceTimersByTimeAsync(HOUR);
    setApiBaseUrl('https://third.example/api/v1');
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(useUpdateStore.getState().verdict).toBeNull();
  });
});
