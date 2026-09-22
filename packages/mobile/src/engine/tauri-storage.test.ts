import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let invoke: ReturnType<typeof vi.fn>;

beforeEach(() => {
  invoke = vi.fn();
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: { invoke },
  });
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe('useUserReplicaDb（多账号副本隔离，issue 02）', () => {
  it('切换到登录用户的副本数据库', async () => {
    const { useUserReplicaDb } = await import('./tauri-storage');
    invoke.mockResolvedValueOnce(undefined);

    await useUserReplicaDb('user-1');

    expect(invoke.mock.calls[0]?.[0]).toBe('sql_use_db');
    expect(invoke.mock.calls[0]?.[1]).toEqual({ user: 'user-1' });
  });

  it('切换账号时把不同 userId 传给 Rust 侧（分库在 Rust 侧完成）', async () => {
    const { useUserReplicaDb } = await import('./tauri-storage');
    invoke.mockResolvedValue(undefined);

    await useUserReplicaDb('user-1');
    await useUserReplicaDb('user-2');

    expect(invoke.mock.calls.map((call) => call[1])).toEqual([
      { user: 'user-1' },
      { user: 'user-2' },
    ]);
  });

  it('后端失败向上传播（调用方决定是否回退）', async () => {
    const { useUserReplicaDb } = await import('./tauri-storage');
    invoke.mockRejectedValueOnce(new Error('disk full'));

    await expect(useUserReplicaDb('user-1')).rejects.toThrow('disk full');
  });
});

describe('createTauriSqlStorage — SqlStorage 契约（issue 02）', () => {
  it('exec：转发 SQL，不返回行', async () => {
    const { createTauriSqlStorage } = await import('./tauri-storage');
    invoke.mockResolvedValueOnce(undefined);
    const storage = createTauriSqlStorage();

    await expect(storage.exec('CREATE TABLE t(x)')).resolves.toBeUndefined();
    expect(invoke.mock.calls[0]?.[0]).toBe('sql_exec');
    expect(invoke.mock.calls[0]?.[1]).toEqual({ sql: 'CREATE TABLE t(x)' });
  });

  it('all：查询转发并按对象行返回；位置参数原样绑定', async () => {
    const { createTauriSqlStorage } = await import('./tauri-storage');
    const rows = [{ id: 't1', title: 'Buy milk' }, { id: 't2', title: 'Walk dog' }];
    invoke.mockResolvedValueOnce(rows);
    const storage = createTauriSqlStorage();

    await expect(
      storage.all('SELECT id, title FROM task WHERE done = ? AND title LIKE ?', [0, '%milk%']),
    ).resolves.toEqual(rows);
    const call = invoke.mock.calls.at(-1);
    expect(call?.[0]).toBe('sql_all');
    expect(call?.[1]).toEqual({
      sql: 'SELECT id, title FROM task WHERE done = ? AND title LIKE ?',
      params: [0, '%milk%'],
    });
  });

  it('all：缺省 params 绑定为空数组（无参查询）', async () => {
    const { createTauriSqlStorage } = await import('./tauri-storage');
    invoke.mockResolvedValueOnce([]);
    const storage = createTauriSqlStorage();

    await expect(storage.all('SELECT 1 AS x')).resolves.toEqual([]);
    const call = invoke.mock.calls.at(-1);
    expect(call?.[0]).toBe('sql_all');
    expect(call?.[1]).toEqual({ sql: 'SELECT 1 AS x', params: [] });
  });

  it('run：把 Rust sql_run 的裸变更数适配成 SqlStorage 结果', async () => {
    const { createTauriSqlStorage } = await import('./tauri-storage');
    invoke.mockResolvedValueOnce(3);
    const storage = createTauriSqlStorage();

    await expect(storage.run('DELETE FROM task WHERE id = ?', ['t1'])).resolves.toEqual({
      changes: 3,
    });
    const call = invoke.mock.calls.at(-1);
    expect(call?.[0]).toBe('sql_run');
    expect(call?.[1]).toEqual({
      sql: 'DELETE FROM task WHERE id = ?',
      params: ['t1'],
    });
  });

  it('run：零行受影响返回 { changes: 0 } 而非 falsy', async () => {
    const { createTauriSqlStorage } = await import('./tauri-storage');
    invoke.mockResolvedValueOnce(0);
    const storage = createTauriSqlStorage();

    await expect(storage.run('DELETE FROM task')).resolves.toEqual({ changes: 0 });
  });

  it('close：连接由 Rust 侧随 app 生命周期管理，为 no-op 且不触发 IPC', async () => {
    const { createTauriSqlStorage } = await import('./tauri-storage');
    const storage = createTauriSqlStorage();

    await expect(storage.close()).resolves.toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('后端错误向上传播（Engine 侧回滚 / UI 侧提示）', async () => {
    const { createTauriSqlStorage } = await import('./tauri-storage');
    invoke.mockRejectedValueOnce(new Error('no such table'));
    const storage = createTauriSqlStorage();

    await expect(storage.all('SELECT * FROM missing')).rejects.toThrow('no such table');
  });
});
