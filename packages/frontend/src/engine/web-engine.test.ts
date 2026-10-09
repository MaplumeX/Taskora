/**
 * web Engine 装配：登录后本标签页争到 leader、打开副本、首次同步；登出
 * 释放副本与锁并退回 REST；副本打不开时回退 REST。浏览器能力（Web Locks、
 * OPFS worker）用假实现注入，BroadcastChannel 与 Engine 是真的。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  InMemorySyncHub,
  openEngine,
  ReplicaSchemaTooNewError,
  type EngineOptions,
} from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { isLiveQueryMode, useAuthStore, useSyncStatusStore } from '@taskora/api';

import type { WorkerSqlStorage } from './worker-storage';
import {
  getWebEngine,
  initWebEngine,
  resetWebEngineForTests,
  type WebEngineRuntime,
} from './web-engine';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@taskora/api')>()),
  registerSyncDevice: vi.fn(async () => undefined),
}));

/** Web Locks 的最小假实现：同名锁排队，回调返回即释放。 */
function fakeLocks() {
  const queues = new Map<string, Promise<unknown>>();
  const held = new Set<string>();
  return {
    held,
    locks: {
      request: ((name: string, callback: () => Promise<unknown>) => {
        const previous = queues.get(name) ?? Promise.resolve();
        const run = previous.then(async () => {
          held.add(name);
          try {
            return await callback();
          } finally {
            held.delete(name);
          }
        });
        queues.set(
          name,
          run.catch(() => undefined),
        );
        return run;
      }) as unknown as LockManager['request'],
    },
  };
}

function runtime(overrides: Partial<WebEngineRuntime> = {}) {
  const hub = new InMemorySyncHub();
  const { locks, held } = fakeLocks();
  const channels: BroadcastChannel[] = [];
  const value: WebEngineRuntime = {
    locks,
    createChannel: (name) => {
      const channel = new BroadcastChannel(name);
      channels.push(channel);
      return channel as never;
    },
    openStorage: async () =>
      (await createNodeSqliteStorage(':memory:')) as unknown as WorkerSqlStorage,
    // 真实 Engine，同步走内存 hub（代替 HTTP）
    openEngine: (options: EngineOptions) =>
      openEngine({ ...options, transport: hub.transportFor('u1') }),
    ...overrides,
  };
  return { runtime: value, held, hub, channels };
}

describe('web-engine 装配', () => {
  afterEach(async () => {
    await resetWebEngineForTests();
    useAuthStore.setState({ token: null, user: null } as never);
  });

  it('token 恢复后预加载，但身份未确认前不争 leader 锁或打开账号库', async () => {
    const prepareStorage = vi.fn();
    const discardPreparedStorage = vi.fn();
    const { runtime: rt, held } = runtime({ prepareStorage, discardPreparedStorage });
    const openStorage = vi.spyOn(rt, 'openStorage');
    initWebEngine(new QueryClient(), rt);

    useAuthStore.setState({ token: 'stored-token', user: null } as never);
    expect(prepareStorage).toHaveBeenCalled();
    expect(openStorage).not.toHaveBeenCalled();
    expect(held.size).toBe(0);
    expect(getWebEngine()).toBeNull();

    useAuthStore.setState({ user: { id: 'u1' } } as never);
    await vi.waitFor(() => expect(useSyncStatusStore.getState().status).toBe('synced'));
    expect(openStorage).toHaveBeenCalledWith('u1');
    expect(held.has('taskora-replica:u1')).toBe(true);

    useAuthStore.setState({ token: null, user: null } as never);
    expect(discardPreparedStorage).toHaveBeenCalled();
    await vi.waitFor(() => expect(held.size).toBe(0));
  });

  it('登录 → leader 打开副本并首次同步；读写走本地副本；登出释放锁、退回 REST', async () => {
    const queryClient = new QueryClient();
    const { runtime: rt, held } = runtime();
    initWebEngine(queryClient, rt);
    expect(getWebEngine()).toBeNull();

    useAuthStore.setState({ token: 't', user: { id: 'u1' } } as never);
    const engine = getWebEngine();
    expect(engine).not.toBeNull();
    // 注入后界面读立即改由响应式查询提供（不等首次同步，local-first-v3 issue 06）
    expect(isLiveQueryMode()).toBe(true);

    await vi.waitFor(() => expect(useSyncStatusStore.getState().status).toBe('synced'));
    expect(held.has('taskora-replica:u1')).toBe(true);

    // 本地读写不因浏览器离线而暂停
    expect(queryClient.getDefaultOptions().queries?.networkMode).toBe('always');
    expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe('always');

    const id = await engine!.create('task', { title: '离线也能写' });
    expect((await engine!.get('task', id))?.fields.title).toBe('离线也能写');

    useAuthStore.setState({ token: null, user: null } as never);
    await vi.waitFor(() => expect(held.has('taskora-replica:u1')).toBe(false));
    expect(getWebEngine()).toBeNull();
    expect(isLiveQueryMode()).toBe(false);
    expect(useSyncStatusStore.getState().status).toBe('idle');
    expect(queryClient.getDefaultOptions().queries?.networkMode).toBeUndefined();
  });

  it('副本来自更新的版本：不打开，退回 REST 并提示升级', async () => {
    const { runtime: rt } = runtime({
      openStorage: async () => {
        throw new ReplicaSchemaTooNewError(99, 1);
      },
    });
    initWebEngine(new QueryClient(), rt);
    useAuthStore.setState({ token: 't', user: { id: 'u1' } } as never);
    await vi.waitFor(() => expect(useSyncStatusStore.getState().status).toBe('upgrade-required'));
  });

  it('不支持的浏览器（无运行时）：什么都不做，保持 REST', () => {
    initWebEngine(new QueryClient(), null);
    useAuthStore.setState({ token: 't', user: { id: 'u1' } } as never);
    expect(getWebEngine()).toBeNull();
  });
});
