/**
 * Tauri 侧 SQLite 存储适配器 — Storage 接口的 IPC 实现（android-app issue 02）。
 *
 * 真正的 SQLite 连接（rusqlite，bundled feature 交叉编译 Android NDK）
 * 住在 Rust 侧（见 src-tauri/src/sqlite.rs，自 desktop 平移，command 签名
 * 一致）；webview 通过 invoke 执行 SQL。SQLite 文件即用户数据的可导出
 * 载体（数据主权，ADR-0007）。
 */

import { invoke } from '@tauri-apps/api/core';

import type { SqlRow, SqlStorage } from '@taskora/engine';

/** 是否运行在 Tauri 环境中（非 Tauri 场景如 vitest 不装配 Engine）。 */
export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in globalThis;
}

/**
 * 按登录用户切换 Local Replica 数据库（多账号隔离）：Rust 侧惰性打开
 * 应用数据目录下的 taskora-<userId>.db。登录哪个账号，Engine 就读写哪
 * 个账号的副本，Sync Cursor / Outbox 不跨账号串号。
 */
export async function useUserReplicaDb(userId: string): Promise<void> {
  await invoke('sql_use_db', { user: userId });
}

export function createTauriSqlStorage(): SqlStorage {
  return {
    async exec(sql: string): Promise<void> {
      await invoke('sql_exec', { sql });
    },
    async all<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<T[]> {
      return invoke<T[]>('sql_all', { sql, params });
    },
    async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
      const changes = await invoke<number>('sql_run', { sql, params });
      return { changes };
    },
    async close(): Promise<void> {
      // 连接随 app 生命周期管理（Rust 侧），无需显式关闭
    },
  };
}
