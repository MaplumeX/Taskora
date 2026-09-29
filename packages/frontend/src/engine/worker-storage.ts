/**
 * Engine SqlStorage 的 worker 代理实现（web Local Replica）。
 *
 * 每个调用一条 postMessage，按 id 配对响应；worker 串行执行，所以调用
 * 顺序即执行顺序。worker 报错时以同名 Error 抛出。
 */

import type { SqlRow, SqlStorage } from '@taskora/engine';

import type { SqlRequest, SqlResponse } from './sqlite-protocol';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Worker 或 MessagePort：能发消息、能收消息即可（测试用 MessageChannel）。 */
export interface SqlPort {
  postMessage(message: SqlRequest): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<SqlResponse>) => void): void;
}

export interface WorkerSqlStorage extends SqlStorage {
  /** 打开（必要时创建）该账号的副本库；必须先于其它调用。 */
  open(userId: string): Promise<void>;
}

export function createWorkerSqlStorage(port: SqlPort, onClose?: () => void): WorkerSqlStorage {
  let nextId = 1;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

  port.addEventListener('message', (event) => {
    const response = event.data;
    const call = pending.get(response.id);
    if (!call) return;
    pending.delete(response.id);
    if (response.ok) {
      call.resolve(response.value);
    } else {
      const error = new Error(response.error.message);
      error.name = response.error.name;
      call.reject(error);
    }
  });

  const request = <T>(message: DistributiveOmit<SqlRequest, 'id'>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      port.postMessage({ ...message, id } as SqlRequest);
    });

  return {
    async open(userId) {
      await request({ op: 'open', userId });
    },
    async exec(sql) {
      await request({ op: 'exec', sql });
    },
    all<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []) {
      return request<T[]>({ op: 'all', sql, params });
    },
    run(sql, params = []) {
      return request<{ changes: number }>({ op: 'run', sql, params });
    },
    async close() {
      await request({ op: 'close' });
      onClose?.();
    },
  };
}
