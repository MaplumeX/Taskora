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

describe('useUserReplicaDb', () => {
  it('switches the replica database to the signed-in user', async () => {
    const { useUserReplicaDb } = await import('./tauri-storage');
    invoke.mockResolvedValueOnce(undefined);

    await useUserReplicaDb('user-1');

    expect(invoke.mock.calls[0]?.[0]).toBe('sql_use_db');
    expect(invoke.mock.calls[0]?.[1]).toEqual({ user: 'user-1' });
  });

  it('propagates backend failures (caller decides whether to fall back)', async () => {
    const { useUserReplicaDb } = await import('./tauri-storage');
    invoke.mockRejectedValueOnce(new Error('disk full'));

    await expect(useUserReplicaDb('user-1')).rejects.toThrow('disk full');
  });
});

describe('createTauriSqlStorage', () => {
  it('把 Rust sql_run 的裸变更数适配成 SqlStorage 结果', async () => {
    const { createTauriSqlStorage } = await import('./tauri-storage');
    invoke.mockResolvedValueOnce(3);

    await expect(createTauriSqlStorage().run('DELETE FROM task')).resolves.toEqual({ changes: 3 });
  });
});
