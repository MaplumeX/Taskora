import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setReloadForTest } from './chunkRecovery';
import { loadWithRecovery } from './lazyWithRetry';

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

/** 让已排队的微任务跑完（catch/then 链）。 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('loadWithRecovery', () => {
  it('加载成功时透传模块', async () => {
    const module = { default: () => null };

    await expect(loadWithRecovery(() => Promise.resolve(module))).resolves.toBe(module);
  });

  it('首次失败时自动刷新，并挂起 Promise 不 settle', async () => {
    let settled = false;
    const promise = loadWithRecovery(() => Promise.reject(new Error('chunk 404')));
    void promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await flushMicrotasks();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
  });

  it('冷却期内再次失败时把错误抛给上层', async () => {
    void loadWithRecovery(() => Promise.reject(new Error('chunk 404')));
    await flushMicrotasks();

    const error = new Error('still 404');
    await expect(loadWithRecovery(() => Promise.reject(error))).rejects.toBe(error);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
