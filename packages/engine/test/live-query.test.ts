/**
 * 响应式查询（local-first-v3 issue 06）：精确失效 + 结果去重，经真实
 * Engine（node:sqlite 内存库）与进程内 hub 驱动。
 */

import { describe, expect, it } from 'vitest';

import {
  changeAffects,
  openEngine,
  replaceEqualDeep,
  watchQuery,
  type Engine,
  type EngineChange,
  type LiveQuery,
  type ReplicaRow,
} from '../src/index';
import { HybridClock } from '../src/hlc';
import { InMemorySyncHub } from '../src/hub';
import { createNodeSqliteStorage } from '../src/node';

async function device(name: string, hub?: InMemorySyncHub): Promise<Engine> {
  return openEngine({
    storage: await createNodeSqliteStorage(':memory:'),
    deviceId: name,
    clock: new HybridClock(name, () => 1_000_000),
    ...(hub ? { transport: hub.transportFor('user-1') } : {}),
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 订阅一条查询，记录推送结果与运行次数。 */
function record<T>(engine: Engine, query: LiveQuery<T>) {
  const results: T[] = [];
  let runs = 0;
  const watch = engine.watch(
    {
      dependsOn: query.dependsOn,
      run: () => {
        runs += 1;
        return query.run();
      },
    },
    { next: (result) => results.push(result) },
  );
  return { results, runs: () => runs, watch };
}

const titles = (rows: ReplicaRow[]) => rows.map((row) => row.fields.title);

describe('changeAffects', () => {
  const change: EngineChange = { origin: 'local', entities: ['task'], ids: { task: ['a'] } };

  it('matches whole-entity dependencies and row dependencies by id', () => {
    expect(changeAffects(change, ['task'])).toBe(true);
    expect(changeAffects(change, ['project'])).toBe(false);
    expect(changeAffects(change, [{ entity: 'task', ids: ['a'] }])).toBe(true);
    expect(changeAffects(change, [{ entity: 'task', ids: ['b'] }])).toBe(false);
  });

  it('treats unknown rows and bootstrap as affecting everything of that scope', () => {
    expect(changeAffects({ origin: 'local', entities: ['task'] }, [{ entity: 'task', ids: ['b'] }])).toBe(true);
    expect(changeAffects({ origin: 'bootstrap' }, ['tag'])).toBe(true);
  });
});

describe('replaceEqualDeep', () => {
  it('keeps unchanged subtrees and returns prev when deeply equal', () => {
    const prev = [{ id: 'a', tags: [{ id: 't' }] }, { id: 'b', tags: [] }];
    const same = replaceEqualDeep(prev, [{ id: 'a', tags: [{ id: 't' }] }, { id: 'b', tags: [] }]);
    expect(same).toBe(prev);
    const next = replaceEqualDeep(prev, [{ id: 'a', tags: [{ id: 't' }] }, { id: 'b', tags: [{ id: 'x' }] }]);
    expect(next).not.toBe(prev);
    expect(next[0]).toBe(prev[0]);
    expect(next[1]).not.toBe(prev[1]);
  });

  it('detects added and removed keys', () => {
    expect(replaceEqualDeep({ a: 1 }, { a: 1, b: undefined })).toEqual({ a: 1, b: undefined });
    const prev = { a: 1, b: 2 };
    expect(replaceEqualDeep(prev, { a: 1 })).not.toBe(prev);
  });
});

describe('Engine.watch', () => {
  it('runs once at start and once per affecting write', async () => {
    const engine = await device('d1');
    const tasks = record(engine, { dependsOn: ['task'], run: () => engine.list('task') });
    await settle();
    expect(tasks.results).toEqual([[]]);

    await engine.create('task', { title: 'A' });
    await settle();
    expect(tasks.runs()).toBe(2);
    expect(titles(tasks.results[1])).toEqual(['A']);
  });

  it('does not rerun queries whose dependencies were not written', async () => {
    const engine = await device('d1');
    const tasks = record(engine, { dependsOn: ['task'], run: () => engine.list('task') });
    await settle();
    await engine.create('area', { title: 'Home' });
    await settle();
    expect(tasks.runs()).toBe(1);
  });

  it('reruns a row query only when that row changes', async () => {
    const engine = await device('d1');
    const a = await engine.create('task', { title: 'A' });
    const b = await engine.create('task', { title: 'B' });
    const detail = record(engine, {
      dependsOn: [{ entity: 'task', ids: [a] }],
      run: () => engine.get('task', a),
    });
    await settle();
    await engine.update('task', b, { title: 'B2' });
    await settle();
    expect(detail.runs()).toBe(1);
    await engine.update('task', a, { title: 'A2' });
    await settle();
    expect(detail.runs()).toBe(2);
    expect(detail.results.at(-1)?.fields.title).toBe('A2');
  });

  it('does not push a result structurally equal to the previous one', async () => {
    const engine = await device('d1');
    const id = await engine.create('task', { title: 'A', notes: null });
    const titlesQuery = record(engine, {
      dependsOn: ['task'],
      run: async () => titles(await engine.list('task')),
    });
    await settle();
    // notes 变了，但查询只投影标题：重跑，但不推送
    await engine.update('task', id, { notes: 'n' });
    await settle();
    expect(titlesQuery.runs()).toBe(2);
    expect(titlesQuery.results).toEqual([['A']]);
  });

  it('coalesces notifications of one tick into one rerun', async () => {
    const listeners = new Set<(change: EngineChange) => void>();
    const source = {
      onChange(listener: (change: EngineChange) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    let runs = 0;
    watchQuery(source, { dependsOn: ['task'], run: async () => ++runs }, { next: () => undefined });
    await settle();
    for (let index = 0; index < 3; index += 1) {
      for (const listener of listeners) listener({ origin: 'remote', entities: ['task'] });
    }
    await settle();
    expect(runs).toBe(2);
  });

  it('discards a result made stale by a write that landed while it ran', async () => {
    const listeners = new Set<(change: EngineChange) => void>();
    const source = {
      onChange(listener: (change: EngineChange) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    let value = 'old';
    let release!: () => void;
    let gate: Promise<void> | null = null;
    const pushed: string[] = [];
    watchQuery(
      source,
      {
        dependsOn: ['task'],
        run: async () => {
          const read = value;
          if (gate) await gate;
          return read;
        },
      },
      { next: (result) => pushed.push(result) },
    );
    await settle();
    gate = new Promise((resolve) => (release = resolve));
    for (const listener of listeners) listener({ origin: 'local', entities: ['task'] });
    await settle(); // 重跑开始，读到 old 后卡住
    gate = null;
    value = 'new';
    for (const listener of listeners) listener({ origin: 'local', entities: ['task'] });
    release();
    await settle();
    await settle();
    expect(pushed).toEqual(['old', 'new']);
  });

  it('reruns row queries on cascaded removals whose rows are unknown', async () => {
    const engine = await device('d1');
    const task = await engine.create('task', { title: 'T' });
    const subtask = await engine.create('subtask', { title: 's', taskId: task });
    const detail = record(engine, {
      dependsOn: [{ entity: 'subtask', ids: [subtask] }],
      run: () => engine.get('subtask', subtask),
    });
    await settle();
    await engine.delete('task', [task]);
    await settle();
    expect(detail.results.at(-1)).toBeNull();
  });

  it('reruns on remote changes applied by pull, with row precision', async () => {
    const hub = new InMemorySyncHub();
    const d1 = await device('d1', hub);
    const d2 = await device('d2', hub);
    const a = await d1.create('task', { title: 'A' });
    const b = await d1.create('task', { title: 'B' });
    await d1.sync();
    await d2.sync();
    const detail = record(d2, {
      dependsOn: [{ entity: 'task', ids: [a] }],
      run: () => d2.get('task', a),
    });
    await settle();
    await d1.update('task', b, { title: 'B2' });
    await d1.sync();
    await d2.sync();
    await settle();
    expect(detail.runs()).toBe(1);
    await d1.update('task', a, { title: 'A2' });
    await d1.sync();
    await d2.sync();
    await settle();
    expect(detail.results.at(-1)?.fields.title).toBe('A2');
  });

  it('cancel drops the in-flight result and always pushes the next one', async () => {
    const engine = await device('d1');
    await engine.create('task', { title: 'A' });
    const tasks = record(engine, { dependsOn: ['task'], run: () => engine.list('task') });
    tasks.watch.cancel(); // 首次运行已排队：作废
    await settle();
    expect(tasks.results).toEqual([]);
    tasks.watch.refresh();
    await settle();
    expect(titles(tasks.results[0])).toEqual(['A']);
    // cancel 之后，结构相同的结果也要推送（调用方改写过展示数据）
    tasks.watch.cancel();
    tasks.watch.refresh();
    await settle();
    expect(tasks.results).toHaveLength(2);
  });

  it('reports errors and keeps watching', async () => {
    const engine = await device('d1');
    const errors: unknown[] = [];
    const values: unknown[] = [];
    let fail = true;
    engine.watch(
      {
        dependsOn: ['task'],
        run: async () => {
          if (fail) throw new Error('boom');
          return engine.list('task');
        },
      },
      { next: (value) => values.push(value), error: (error) => errors.push(error) },
    );
    await settle();
    expect(errors).toHaveLength(1);
    fail = false;
    await engine.create('task', { title: 'A' });
    await settle();
    expect(values).toHaveLength(1);
  });

  it('stop unsubscribes', async () => {
    const engine = await device('d1');
    const tasks = record(engine, { dependsOn: ['task'], run: () => engine.list('task') });
    await settle();
    tasks.watch.stop();
    await engine.create('task', { title: 'A' });
    await settle();
    expect(tasks.runs()).toBe(1);
  });
});
