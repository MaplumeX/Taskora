/**
 * web Local Replica 的 SQLite worker（local-first-v3 issue 05）。
 *
 * @sqlite.org/sqlite-wasm + OPFS SyncAccessHandle Pool VFS（opfs-sahpool）：
 * 不需要 COOP/COEP 头，但同一个池目录同时只能被一个实例打开——多标签页
 * 由 Web Locks 选出的 leader 独占（见 web-engine.ts），其余标签页经
 * BroadcastChannel 调用 leader 的 Engine。每个账号一个池目录、一个库文件：
 * 登录哪个账号就读写哪个账号的副本（与桌面端 taskora-<userId>.db 同口径）。
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

import {
  bindParams,
  createSqlRequestHandler,
  type SqlRequest,
  type SqliteDatabase,
} from './sqlite-protocol';

const openDatabase = async (userId: string): Promise<SqliteDatabase> => {
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({
    name: `taskora-${userId}`,
    directory: `/taskora/${userId}`,
  });
  const db = new pool.OpfsSAHPoolDb('/replica.sqlite3');
  return {
    exec(sql) {
      db.exec(sql);
    },
    all(sql, params) {
      return db.selectObjects(sql, bindParams(params) as never) as Record<string, unknown>[];
    },
    run(sql, params) {
      db.exec({ sql, bind: bindParams(params) as never });
      return db.changes();
    },
    close() {
      db.close();
    },
  };
};

const handle = createSqlRequestHandler(openDatabase);

const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<SqlRequest>) => void) | null;
};

// 逐条串行：一条请求处理完（含 open 的异步初始化）才处理下一条。
let queue: Promise<unknown> = Promise.resolve();
scope.onmessage = (event) => {
  queue = queue.then(async () => {
    scope.postMessage(await handle(event.data));
  });
};
