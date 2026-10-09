import { describe, expect, it, vi } from 'vitest';

import { createBrowserStorageRuntime } from './browser-storage';
import type { SqlRequest, SqlResponse } from './sqlite-protocol';

function fakeWorker(failOpen = false) {
  const listeners = new Set<(event: MessageEvent<SqlResponse>) => void>();
  return {
    terminate: vi.fn(),
    addEventListener: (_type: string, listener: (event: MessageEvent<SqlResponse>) => void) =>
      listeners.add(listener),
    postMessage: vi.fn((request: SqlRequest) => {
      const response: SqlResponse =
        failOpen && request.op === 'open'
          ? { id: request.id, ok: false, error: { name: 'Error', message: 'OPFS unavailable' } }
          : { id: request.id, ok: true, value: null };
      queueMicrotask(() => {
        for (const listener of listeners) listener({ data: response } as MessageEvent<SqlResponse>);
      });
    }),
  };
}

describe('browser SQLite preparation', () => {
  it('loads one worker early without opening a database, then reuses it for the verified account', async () => {
    const worker = fakeWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);
    const runtime = createBrowserStorageRuntime(createWorker);

    runtime.prepareStorage();
    runtime.prepareStorage();
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).not.toHaveBeenCalled();

    const storage = await runtime.openStorage('verified-account');
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({
      id: 1,
      op: 'open',
      userId: 'verified-account',
    });
    // 已交给 leader 的 worker 不再属于预加载资源。
    runtime.discardPreparedStorage();
    expect(worker.terminate).not.toHaveBeenCalled();
    await storage.close();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('discards an unused worker on logout and creates a new one for the next account', async () => {
    const first = fakeWorker();
    const second = fakeWorker();
    const factory = vi
      .fn<() => Worker>()
      .mockReturnValueOnce(first as unknown as Worker)
      .mockReturnValueOnce(second as unknown as Worker);
    const runtime = createBrowserStorageRuntime(factory);
    runtime.prepareStorage();
    runtime.discardPreparedStorage();
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(first.postMessage).not.toHaveBeenCalled();

    const storage = await runtime.openStorage('next-account');
    expect(second.postMessage).toHaveBeenCalledWith({ id: 1, op: 'open', userId: 'next-account' });
    await storage.close();
  });

  it('lets normal opening retry when speculative worker creation fails', async () => {
    const worker = fakeWorker();
    const factory = vi
      .fn<() => Worker>()
      .mockImplementationOnce(() => {
        throw new Error('worker unavailable');
      })
      .mockReturnValueOnce(worker as unknown as Worker);
    const runtime = createBrowserStorageRuntime(factory);
    expect(() => runtime.prepareStorage()).not.toThrow();
    const storage = await runtime.openStorage('account');
    await storage.close();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('terminates a prepared worker when opening fails, preserving the REST fallback error', async () => {
    const worker = fakeWorker(true);
    const runtime = createBrowserStorageRuntime(() => worker as unknown as Worker);
    runtime.prepareStorage();
    await expect(runtime.openStorage('account')).rejects.toThrow('OPFS unavailable');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
