/**
 * node:sqlite 存储适配器（Node ≥ 22，实验性 API）。
 *
 * 通过子路径导出隔离：根入口保持纯（浏览器/Rust 侧可安全 import），
 * `node:sqlite` 仅在此动态加载。
 */

import { createRequire } from 'node:module';

import type { SqlRow, SqlStorage } from '../storage';

// 不用 import.meta（CJS 构建产物不允许）：require 只用于内置模块，
// 路径任意。打包器（Vite）不会静态解析 node:sqlite。
const nodeRequire = createRequire(`${process.cwd()}/`);

export async function createNodeSqliteStorage(path: string): Promise<SqlStorage> {
  const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');
  const db = new DatabaseSync(path);
  const bind = (params: unknown[]) => params as never[];

  return {
    async exec(sql: string) {
      db.exec(sql);
    },
    async all<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<T[]> {
      const statement = db.prepare(sql);
      return statement.all(...bind(params)) as T[];
    },
    async run(sql: string, params: unknown[] = []) {
      const statement = db.prepare(sql);
      const result = statement.run(...bind(params)) as unknown as { changes: number };
      return { changes: result.changes ?? 0 };
    },
    async close() {
      db.close();
    },
  };
}
