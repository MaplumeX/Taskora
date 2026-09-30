/**
 * web Local Replica 的 SQL 消息协议（主线程 ↔ SQLite worker）。
 *
 * SQLite（@sqlite.org/sqlite-wasm + OPFS）只能在 dedicated worker 里使用
 * 同步访问句柄，所以 Engine 的 SqlStorage 在主线程是一层 postMessage
 * 代理（worker-storage.ts），真正的数据库在 worker 里（sqlite.worker.ts）。
 * 请求按到达顺序逐条执行：worker 单线程，BEGIN / COMMIT 与其间的语句
 * 不会被别的请求插队（Engine 自己串行化写事务）。
 */

export type SqlRequest =
  | { id: number; op: 'open'; userId: string }
  | { id: number; op: 'exec'; sql: string }
  | { id: number; op: 'all'; sql: string; params: unknown[] }
  | { id: number; op: 'run'; sql: string; params: unknown[] }
  | { id: number; op: 'close' };

export type SqlResponse =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: { name: string; message: string } };

/** worker 里一个打开的数据库需要提供的最小能力。 */
export interface SqliteDatabase {
  exec(sql: string): void;
  all(sql: string, params: unknown[]): Record<string, unknown>[];
  run(sql: string, params: unknown[]): number;
  close(): void;
}

/**
 * worker 侧的请求处理器：open 之后才接受语句；错误原样带回主线程（名字
 * 保留，便于 Engine 区分约束冲突等）。
 */
export function createSqlRequestHandler(
  openDatabase: (userId: string) => Promise<SqliteDatabase>,
): (request: SqlRequest) => Promise<SqlResponse> {
  let db: SqliteDatabase | null = null;

  const requireDb = (): SqliteDatabase => {
    if (!db) throw new Error('数据库尚未打开');
    return db;
  };

  return async (request) => {
    try {
      switch (request.op) {
        case 'open':
          db?.close();
          db = await openDatabase(request.userId);
          return { id: request.id, ok: true, value: null };
        case 'exec':
          requireDb().exec(request.sql);
          return { id: request.id, ok: true, value: null };
        case 'all':
          return { id: request.id, ok: true, value: requireDb().all(request.sql, request.params) };
        case 'run':
          return {
            id: request.id,
            ok: true,
            value: { changes: requireDb().run(request.sql, request.params) },
          };
        case 'close':
          db?.close();
          db = null;
          return { id: request.id, ok: true, value: null };
      }
    } catch (error) {
      return {
        id: request.id,
        ok: false,
        error: {
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

/** 绑定参数：undefined 一律按 NULL（与 node:sqlite / Tauri 适配器同口径）。 */
export function bindParams(params: unknown[]): unknown[] {
  return params.map((value) => (value === undefined ? null : value));
}
