import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moduleLoader, setModuleLoadRecovery } from '@taskora/ui/lib/module-loader';
import { loadWithRecovery } from './lazyWithRetry';

import {
  __setReloadForTest,
  installChunkLoadRecovery,
  reloadOnceForNewBuild,
} from './chunkRecovery';

const FLAG = 'taskora:chunk-reload-at';

const reload = vi.fn();

beforeEach(() => {
  sessionStorage.clear();
  reload.mockClear();
  __setReloadForTest(reload);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('reloadOnceForNewBuild', () => {
  it('发起一次刷新并记下时间戳', () => {
    expect(reloadOnceForNewBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(FLAG)).toBe(String(Date.now()));
  });

  it('冷却期内重复失败不再刷新（打断刷新循环）', () => {
    expect(reloadOnceForNewBuild()).toBe(true);

    vi.advanceTimersByTime(9_000);

    expect(reloadOnceForNewBuild()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('冷却过后可以再自愈一次（对应下一次部署）', () => {
    expect(reloadOnceForNewBuild()).toBe(true);

    vi.advanceTimersByTime(10_000);

    expect(reloadOnceForNewBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('sessionStorage 不可用时安全降级为不刷新', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(reloadOnceForNewBuild()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('installChunkLoadRecovery', () => {
  it('background chunk failure leaves the current page intact and foreground navigation still recovers', async () => {
    installChunkLoadRecovery();
    setModuleLoadRecovery(loadWithRecovery);
    const loader = moduleLoader(async () => {
      const error = new Error('chunk 404');
      const event = new Event('vite:preloadError', { cancelable: true });
      Object.assign(event, { payload: error });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      throw error;
    });
    await expect(loader.preload()).rejects.toThrow('chunk 404');
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).not.toHaveBeenCalled();
    void loader();
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('拦截 vite:preloadError 并自愈', () => {
    installChunkLoadRecovery();

    const event = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(event);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
