/**
 * Engine 模式的响应式查询（local-first-v3 issue 06），经真实 Engine
 * （node:sqlite 内存库）与真实 Engine 后端驱动：
 *
 * - 列表视图不经 React Query（其缓存里没有这些查询）；
 * - 一次写入只让受影响的查询各重跑一次，无关的查询不跑；
 * - 没变的行保持同一对象（结构共享）；
 * - 乐观补丁在写入落库前即可见，写入失败时恢复。
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openEngine, type Engine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import type { FeedItem } from '@taskora/shared';

import { setAreaBackend } from '@/api/area-backend';
import { setProjectBackend } from '@/api/project-backend';
import { setTagBackend } from '@/api/tag-backend';
import { type TaskBackend, setTaskBackend } from '@/api/task-backend';
import { createEngineAreaBackend } from '../engine/area-backend.engine';
import { attachLiveQueries, detachLiveQueries, isLiveQueryMode } from '../engine/live-queries';
import { createEngineProjectBackend } from '../engine/project-backend.engine';
import { createEngineTagBackend } from '../engine/tag-backend.engine';
import { createEngineTaskBackend } from '../engine/task-backend.engine';
import { useAreasQuery } from './useAreas';
import { useFeedQuery } from './useFeed';
import { useTaskQuery, useTasksQuery, useUpdateTask } from './useTasks';

let engine: Engine;
let tasks: TaskBackend;
let queryClient: QueryClient;
let calls: { getFeed: number; getTasks: number; getTask: number };

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

/** 让在飞的查询与通知跑完。 */
async function settle() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  engine = await openEngine({
    storage: await createNodeSqliteStorage(':memory:'),
    deviceId: 'dev-test',
  });
  calls = { getFeed: 0, getTasks: 0, getTask: 0 };
  const real = createEngineTaskBackend({ engine });
  tasks = {
    ...real,
    getFeed: (view) => {
      calls.getFeed += 1;
      return real.getFeed(view);
    },
    getTasks: (params) => {
      calls.getTasks += 1;
      return real.getTasks(params);
    },
    getTask: (id) => {
      calls.getTask += 1;
      return real.getTask(id);
    },
  };
  setTaskBackend(tasks);
  setProjectBackend(createEngineProjectBackend({ engine }));
  setAreaBackend(createEngineAreaBackend({ engine }));
  setTagBackend(createEngineTagBackend({ engine }));
  attachLiveQueries(engine);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(async () => {
  detachLiveQueries();
  setTaskBackend(undefined);
  setProjectBackend(undefined);
  setAreaBackend(undefined);
  setTagBackend(undefined);
  queryClient.clear();
  await engine.close();
});

const titles = (items: FeedItem[] | undefined) => items?.map((item) => item.title);

describe('useEngineQuery（Engine 模式的列表视图）', () => {
  it('reads the replica without going through React Query', async () => {
    await tasks.createTask({ title: 'A' });
    const { result } = renderHook(() => useFeedQuery('inbox'), { wrapper });
    await waitFor(() => expect(titles(result.current.data)).toEqual(['A']));
    expect(result.current.isSuccess).toBe(true);
    expect(queryClient.getQueryCache().findAll({ queryKey: ['feed'] })).toHaveLength(1);
    expect(queryClient.getQueryData(['feed', 'inbox'])).toBeUndefined();
  });

  it('a write reruns each affected query exactly once', async () => {
    const created = await tasks.createTask({ title: 'A' });
    const feed = renderHook(() => useFeedQuery('inbox'), { wrapper });
    const list = renderHook(() => useTasksQuery(), { wrapper });
    await waitFor(() => expect(titles(feed.result.current.data)).toEqual(['A']));
    await waitFor(() => expect(list.result.current.data).toHaveLength(1));
    await settle();
    const before = { ...calls };

    await act(async () => {
      await tasks.updateTask(created.id, { title: 'A2' });
    });
    await waitFor(() => expect(titles(feed.result.current.data)).toEqual(['A2']));
    await settle();
    expect(calls.getFeed - before.getFeed).toBe(1);
    expect(calls.getTasks - before.getTasks).toBe(1);
  });

  it('writes to unrelated entities do not rerun the query', async () => {
    const list = renderHook(() => useTasksQuery(), { wrapper });
    const areas = renderHook(() => useAreasQuery(), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await settle();
    const before = calls.getTasks;

    await act(async () => {
      await engine.create('area', { title: 'Home', sortOrder: 0 });
    });
    await waitFor(() => expect(areas.result.current.data).toHaveLength(1));
    await settle();
    expect(calls.getTasks).toBe(before);
  });

  it('a task detail reruns only when that task changes', async () => {
    const a = await tasks.createTask({ title: 'A' });
    const b = await tasks.createTask({ title: 'B' });
    const detail = renderHook(() => useTaskQuery(a.id), { wrapper });
    await waitFor(() => expect(detail.result.current.data?.title).toBe('A'));
    await settle();
    const before = calls.getTask;

    await act(async () => {
      await tasks.updateTask(b.id, { title: 'B2' });
    });
    await settle();
    expect(calls.getTask).toBe(before);

    await act(async () => {
      await tasks.updateTask(a.id, { title: 'A2' });
    });
    await waitFor(() => expect(detail.result.current.data?.title).toBe('A2'));
  });

  it('unchanged rows keep their identity across reruns', async () => {
    const a = await tasks.createTask({ title: 'A' });
    await tasks.createTask({ title: 'B' });
    const { result } = renderHook(() => useFeedQuery('inbox'), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    const rowB = result.current.data!.find((item) => item.title === 'B');

    await act(async () => {
      await tasks.updateTask(a.id, { title: 'A2' });
    });
    await waitFor(() => expect(titles(result.current.data)).toContain('A2'));
    expect(result.current.data!.find((item) => item.title === 'B')).toBe(rowB);
  });

  it('shows the optimistic patch before the write lands, then the replica result', async () => {
    const a = await tasks.createTask({ title: 'A' });
    const feed = renderHook(() => useFeedQuery('inbox'), { wrapper });
    await waitFor(() => expect(titles(feed.result.current.data)).toEqual(['A']));

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const real = tasks.updateTask;
    tasks.updateTask = async (id, data) => {
      await gate;
      return real(id, data);
    };
    const mutation = renderHook(() => useUpdateTask(), { wrapper });
    act(() => mutation.result.current.mutate({ id: a.id, data: { title: 'A2' } }));
    await waitFor(() => expect(titles(feed.result.current.data)).toEqual(['A2']));
    expect((await engine.get('task', a.id))?.fields.title).toBe('A');

    release();
    await waitFor(() => expect(mutation.result.current.isSuccess).toBe(true));
    await settle();
    expect(titles(feed.result.current.data)).toEqual(['A2']);
    expect((await engine.get('task', a.id))?.fields.title).toBe('A2');
  });

  it('restores the snapshot when the write fails', async () => {
    const a = await tasks.createTask({ title: 'A' });
    const feed = renderHook(() => useFeedQuery('inbox'), { wrapper });
    await waitFor(() => expect(titles(feed.result.current.data)).toEqual(['A']));

    tasks.updateTask = vi.fn(async () => {
      throw new Error('bug');
    });
    const mutation = renderHook(() => useUpdateTask(), { wrapper });
    act(() => mutation.result.current.mutate({ id: a.id, data: { title: 'A2' } }));
    await waitFor(() => expect(mutation.result.current.isError).toBe(true));
    await settle();
    expect(titles(feed.result.current.data)).toEqual(['A']);
  });

  it('falls back to React Query when the Engine is detached', async () => {
    await tasks.createTask({ title: 'A' });
    const { result } = renderHook(() => useFeedQuery('inbox'), { wrapper });
    await waitFor(() => expect(titles(result.current.data)).toEqual(['A']));

    act(() => detachLiveQueries());
    expect(isLiveQueryMode()).toBe(false);
    // 后端仍是 Engine：React Query 经它读，结果进 React Query 缓存
    await waitFor(() => expect(queryClient.getQueryData(['feed', 'inbox'])).toBeDefined());
    expect(titles(result.current.data)).toEqual(['A']);
  });
});
