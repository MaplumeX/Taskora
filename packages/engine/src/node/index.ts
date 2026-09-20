/**
 * node:sqlite 存储适配器（Node ≥ 22，实验性 API）。
 *
 * 通过子路径导出隔离：根入口保持纯（浏览器/Rust 侧可安全 import），
 * `node:sqlite` 仅在此动态加载。
 */

import { createRequire } from 'node:module';

import type { SqlRow, SqlStorage } from '../storage';

const require = createRequire(import.meta.url);

export async function createNodeSqliteStorage(path: string): Promise<SqlStorage> {
  // createRequire 而非动态 import：打包器（Vite）不会试图解析 node:sqlite
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
  const db = new DatabaseSync(path);
  const bind = (params: unknown[]) => params as never[];

  return {
    exec(sql: string) {
      db.exec(sql);
    },
    all<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): T[] {
      const statement = db.prepare(sql);
      return statement.all(...bind(params)) as T[];
    },
    run(sql: string, params: unknown[] = []) {
      const statement = db.prepare(sql);
      const result = statement.run(...bind(params)) as unknown as { changes: number };
      return { changes: result.changes ?? 0 };
    },
    close() {
      db.close();
    },
  };
}
