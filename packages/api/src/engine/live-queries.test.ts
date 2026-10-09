import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openEngine, type Engine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import {
  attachLiveQueries,
  detachLiveQueries,
  hasPendingLiveQueries,
  liveQueryState,
  prefetchLiveQuery,
  subscribeLiveQuery,
} from './live-queries';

let engine: Engine;
beforeEach(async () => {
  engine = await openEngine({
    storage: await createNodeSqliteStorage(':memory:'),
    deviceId: 'preload-test',
  });
  attachLiveQueries(engine);
});
afterEach(async () => {
  detachLiveQueries();
  vi.useRealTimers();
  await engine.close();
});

describe('navigation query prefetch', () => {
  it('also yields to active reads when the page already has an older result', async () => {
    let finish!: (value: string) => void;
    const run = vi
      .fn()
      .mockResolvedValueOnce('old')
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      );
    const definition = { queryKey: ['active-page'], dependsOn: ['task'] as const, queryFn: run };
    const unsubscribe = subscribeLiveQuery(definition, vi.fn());
    await vi.waitFor(() => expect(liveQueryState(definition.queryKey).data).toBe('old'));
    await engine.create('task', { title: 'trigger refresh' });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(liveQueryState(definition.queryKey).status).toBe('success');
    expect(hasPendingLiveQueries()).toBe(true);
    finish('new');
    await vi.waitFor(() => expect(liveQueryState(definition.queryKey).data).toBe('new'));
    expect(hasPendingLiveQueries()).toBe(false);
    unsubscribe();
  });

  it('shares the in-flight read with navigation and keeps listening to replica writes', async () => {
    let finish!: (value: string[]) => void;
    const run = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string[]>((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation(async () =>
        (await engine.list('task')).map((row) => row.fields.title as string),
      );
    const definition = {
      queryKey: ['tasks', { projectId: 'p' }],
      dependsOn: ['task'] as const,
      queryFn: run,
    };
    prefetchLiveQuery(definition);
    prefetchLiveQuery(definition);
    await Promise.resolve();
    const unsubscribe = subscribeLiveQuery(definition, vi.fn());
    expect(run).toHaveBeenCalledTimes(1);
    expect(hasPendingLiveQueries()).toBe(true);
    finish(['initial']);
    await vi.waitFor(() => expect(liveQueryState(definition.queryKey).data).toEqual(['initial']));
    expect(hasPendingLiveQueries()).toBe(false);
    await engine.create('task', { title: 'updated' });
    await vi.waitFor(() => expect(liveQueryState(definition.queryKey).data).toEqual(['updated']));
    expect(run).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('updates before navigation, and stops speculative watches after 30 seconds', async () => {
    const definition = {
      queryKey: ['task-preview'],
      dependsOn: ['task'] as const,
      queryFn: vi.fn(async () => (await engine.list('task')).map((row) => row.fields.title)),
    };
    prefetchLiveQuery(definition);
    await vi.waitFor(() => expect(liveQueryState(definition.queryKey).status).toBe('success'));
    await engine.create('task', { title: 'before-click' });
    await vi.waitFor(() =>
      expect(liveQueryState(definition.queryKey).data).toEqual(['before-click']),
    );
    // Use a second prefetch with fake time so the expiry itself is deterministic.
    vi.useFakeTimers();
    const expired = { ...definition, queryKey: ['expired-preview'] };
    prefetchLiveQuery(expired);
    await vi.advanceTimersByTimeAsync(30_000);
    const before = definition.queryFn.mock.calls.length;
    await engine.create('task', { title: 'after-expiry' });
    await vi.advanceTimersByTimeAsync(0);
    // Only the original, still subscribed prefetch reruns.
    expect(definition.queryFn.mock.calls.length).toBe(before + 1);
    const unsubscribe = subscribeLiveQuery(expired, vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(liveQueryState(expired.queryKey).data).toEqual(
      expect.arrayContaining(['before-click', 'after-expiry']),
    );
    unsubscribe();
  });

  it('drops results and pending reads when switching accounts', async () => {
    let finish!: (value: string) => void;
    const old = {
      queryKey: ['account-data'],
      dependsOn: ['task'] as const,
      queryFn: () =>
        new Promise<string>((done) => {
          finish = done;
        }),
    };
    prefetchLiveQuery(old);
    await Promise.resolve();
    detachLiveQueries();
    attachLiveQueries(engine);
    finish('previous user');
    await Promise.resolve();
    await Promise.resolve();
    expect(liveQueryState(old.queryKey).data).toBeUndefined();
  });
});
