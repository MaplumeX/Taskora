import { createWorkerSqlStorage, type WorkerSqlStorage } from './worker-storage';

/** 提前加载 SQLite/WASM；账号数据库仍只由取得 leader 锁的调用者打开。 */
export function createBrowserStorageRuntime(
  createWorker: () => Worker = () =>
    new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' }),
) {
  let prepared: Worker | null = null;

  return {
    prepareStorage(): void {
      if (prepared) return;
      try {
        prepared = createWorker();
      } catch {
        // 预加载失败不拦启动；正式 open 会重试，并沿原有路径回退 REST。
      }
    },
    discardPreparedStorage(): void {
      prepared?.terminate();
      prepared = null;
    },
    async openStorage(userId: string): Promise<WorkerSqlStorage> {
      const worker = prepared ?? createWorker();
      prepared = null;
      const storage = createWorkerSqlStorage(worker, () => worker.terminate());
      try {
        await storage.open(userId);
        return storage;
      } catch (error) {
        worker.terminate();
        throw error;
      }
    },
  };
}
