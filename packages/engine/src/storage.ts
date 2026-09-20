/**
 * 存储接口抽象 — Engine 不绑定具体存储实现（ADR-0007）。
 *
 * V1 交付 SQLite 一条路径：
 * - 桌面端：Tauri 侧 rusqlite 适配器（IPC，异步）；
 * - Node / 测试：node:sqlite 适配器（`@taskora/engine/node`）；
 * - Web（WASM + OPFS）为后续阶段预留。
 *
 * 接口刻意窄化为「带位置参数的 SQL」且全异步：任意能执行 SQLite
 * 语句的后端（本进程、Tauri IPC）都可实现。
 */

export interface SqlRow {
  [column: string]: unknown;
}

export interface SqlStorage {
  /** 执行一条（或多条分号分隔的）语句，无返回行。 */
  exec(sql: string): Promise<void>;
  /** 查询返回行（对象形式，列为键）。 */
  all<T extends SqlRow = SqlRow>(sql: string, params?: unknown[]): Promise<T[]>;
  /** 执行写语句，返回受影响行数。 */
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  close(): Promise<void>;
}

/** 事务辅助：异常自动回滚。 */
export async function inTransaction<T>(storage: SqlStorage, fn: () => Promise<T>): Promise<T> {
  await storage.exec('BEGIN');
  try {
    const result = await fn();
    await storage.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      await storage.exec('ROLLBACK');
    } catch {
      // 回滚失败时保留原始异常
    }
    throw error;
  }
}
