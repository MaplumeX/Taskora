/**
 * worker 代理的 SqlStorage：主线程 ↔ worker 的消息协议端到端（worker 侧用
 * node:sqlite 代替 sqlite-wasm），并在其上跑一个真实 Engine。
 */
import { createRequire } from 'node:module';
import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it } from 'vitest';
import { openEngine } from '@taskora/engine';

import { createSqlRequestHandler, bindParams, type SqlRequest } from './sqlite-protocol';
import { createWorkerSqlStorage, type SqlPort } from './worker-storage';

const nodeRequire = createRequire(import.meta.url);

function nodeWorker() {
  const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');
  const opened: string[] = [];
  const handle = createSqlRequestHandler(async (userId) => {
    opened.push(userId);
    const db = new DatabaseSync(':memory:');
    return {
      exec: (sql) => db.exec(sql),
      all: (sql, params) =>
        db.prepare(sql).all(...(bindParams(params) as never[])) as Record<string, unknown>[],
      run: (sql, params) =>
        Number(db.prepare(sql).run(...(bindParams(params) as never[])).changes ?? 0),
      close: () => db.close(),
    };
  });
  const channel = new MessageChannel();
  let queue: Promise<unknown> = Promise.resolve();
  channel.port2.on('message', (request: SqlRequest) => {
    queue = queue.then(async () => channel.port2.postMessage(await handle(request)));
  });
  const port: SqlPort = {
    postMessage: (message) => channel.port1.postMessage(message),
    addEventListener: (_type, listener) =>
      channel.port1.on('message', (data) => listener({ data } as MessageEvent)),
  };
  return { port, opened, close: () => channel.port1.close() };
}

describe('worker SqlStorage', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
  });

  it('open → exec / run / all 按调用顺序执行；错误带名字回到主线程', async () => {
    const worker = nodeWorker();
    cleanups.push(worker.close);
    const storage = createWorkerSqlStorage(worker.port);

    await expect(storage.exec('SELECT 1')).rejects.toThrow('数据库尚未打开');
    await storage.open('user-1');
    expect(worker.opened).toEqual(['user-1']);

    await storage.exec('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)');
    const inserts = await Promise.all([
      storage.run('INSERT INTO t VALUES (?, ?)', ['a', 1]),
      storage.run('INSERT INTO t VALUES (?, ?)', ['b', undefined]),
    ]);
    expect(inserts).toEqual([{ changes: 1 }, { changes: 1 }]);
    expect(await storage.all('SELECT * FROM t ORDER BY id')).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: null },
    ]);

    const failure = await storage.run('INSERT INTO t VALUES (?, ?)', ['a', 2]).catch((e) => e);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure.message)).toMatch(/UNIQUE/);
  });

  it('真实 Engine 跑在代理之上：写、读、事务', async () => {
    const worker = nodeWorker();
    cleanups.push(worker.close);
    const storage = createWorkerSqlStorage(worker.port);
    await storage.open('user-1');
    const engine = await openEngine({ storage, deviceId: 'web-device' });

    const id = await engine.create('task', { title: '经 worker 写入' });
    await engine.update('task', id, { notes: '备注' });
    expect((await engine.get('task', id))?.fields).toMatchObject({
      title: '经 worker 写入',
      notes: '备注',
    });
    expect(await engine.pendingCount()).toBeGreaterThan(0);
  });
});
