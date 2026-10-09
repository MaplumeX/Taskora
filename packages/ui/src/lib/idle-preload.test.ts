import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canPreloadCode, startIdlePreload } from './idle-preload';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('idle preloading', () => {
  it('waits for current data, runs modules one at a time, and yields between them', async () => {
    let ready = false;
    let finish!: () => void;
    const first = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const second = vi.fn(async () => {});
    const stop = startIdlePreload([first, second], { canRun: () => true, isReady: () => ready });
    await vi.advanceTimersByTimeAsync(1000);
    expect(first).not.toHaveBeenCalled();
    ready = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    finish();
    await vi.advanceTimersByTimeAsync(499);
    expect(second).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(second).toHaveBeenCalledTimes(1);
    stop();
  });

  it('continues after a background failure and cancels work on unmount', async () => {
    const first = vi.fn(async () => {
      throw new Error('offline');
    });
    const second = vi.fn(async () => {});
    const stop = startIdlePreload([first, second], { canRun: () => true, isReady: () => true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(first).toHaveBeenCalledTimes(1);
    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(second).not.toHaveBeenCalled();
  });

  it('rechecks visibility and network when an idle callback actually executes', async () => {
    let callback!: IdleRequestCallback;
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((run: IdleRequestCallback) => {
        callback = run;
        return 7;
      }),
    );
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    let allowed = true;
    const task = vi.fn(async () => {});
    const stop = startIdlePreload([task], { canRun: () => allowed, isReady: () => true });
    await vi.advanceTimersByTimeAsync(500);
    allowed = false;
    callback({ didTimeout: false, timeRemaining: () => 10 });
    expect(task).not.toHaveBeenCalled();
    stop();
    vi.unstubAllGlobals();
  });
});

describe('web network policy', () => {
  it.each([
    { saveData: true },
    { effectiveType: '2g' },
    { effectiveType: '3g' },
    { downlink: 0.5 },
  ])('avoids speculative downloads on constrained connections: %j', (connection) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
    expect(canPreloadCode('web')).toBe(false);
    expect(canPreloadCode('desktop')).toBe(true);
    Reflect.deleteProperty(navigator, 'connection');
  });

  it('allows a small web queue without network information, but skips it offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    expect(canPreloadCode('web')).toBe(true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(canPreloadCode('web')).toBe(false);
  });
});
