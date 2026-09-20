/**
 * Engine 门面 — UI 的唯一读写入口（CONTEXT.md「引擎与同步」）。
 *
 * 读：query/subscribe 直接作用于 Local Replica，零网络往返；写入后响应式
 * 查询自动失效重算。写：create/update 落库同时进 Outbox（字段级 HLC +
 * device id）；flush 把 Outbox 推给 Sync Hub，pull 凭 Sync Cursor 拉全局
 * 增量。断网时全功能可用，恢复联网后自动收敛。
 */

import { LocalReplica, type ReplicaRow } from './replica';
import { HybridClock } from './hlc';
import { positionBetween } from './position';
import type { SyncEntity, WireRow } from './entities';
import type { SyncTransport } from './protocol';
import type { SqlStorage } from './storage';

export interface EngineOptions {
  storage: SqlStorage;
  deviceId: string;
  /** 缺省时为离线引擎（读写全功能，仅无同步）。 */
  transport?: SyncTransport;
  /** 可注入的 HLC（测试确定性）。 */
  clock?: HybridClock;
  generateId?: () => string;
}

export interface Engine {
  readonly deviceId: string;
  /** 读（selector 内使用 reader 提供的查询面）。 */
  query<T>(selector: (reader: ReplicaReader) => T): T;
  /** 响应式订阅：selector 结果变化时回调。返回退订函数。 */
  subscribe<T>(selector: (reader: ReplicaReader) => T, listener: (result: T) => void): () => void;
  /** 创建实体，返回 id。 */
  create(entity: SyncEntity, values: WireRow): string;
  /** 更新实体字段（软删除即更新 trashedAt 等字段）。 */
  update(entity: SyncEntity, id: string, patch: WireRow): void;
  /** 列出某实体的全部行（按 Position / sortOrder 排序）。 */
  list(entity: SyncEntity): ReplicaRow[];
  /** 取单个实体行（含 id），不存在返回 null。 */
  get(entity: SyncEntity, id: string): ReplicaRow | null;
  /** Outbox 未同步条数（诊断/测试）。 */
  pendingCount(): number;
  /** 把 Outbox 推给 Sync Hub；成功后清空已推条目。 */
  flush(): Promise<void>;
  /** 凭 Sync Cursor 拉取增量并应用；resync 时自动 bootstrap。 */
  pull(): Promise<void>;
  /** flush + pull（正常在线同步路径）。 */
  sync(): Promise<void>;
  /** 从 hub 全量快照重建本地副本（保留未同步 Outbox）。 */
  bootstrap(): Promise<void>;
  /** 当前 Sync Cursor。 */
  cursor(): number;
  close(): void;
}

export interface ReplicaReader {
  list(entity: SyncEntity): ReplicaRow[];
  get(entity: SyncEntity, id: string): ReplicaRow | null;
}

export function openEngine(options: EngineOptions): Engine {
  const replica = new LocalReplica(options.storage, {
    deviceId: options.deviceId,
    clock: options.clock,
    generateId: options.generateId,
  });
  replica.init();

  const reader: ReplicaReader = {
    list: (entity) => replica.list(entity),
    get: (entity, id) => {
      const state = replica.get(entity, id);
      if (!state) return null;
      return { id, fields: state.fields };
    },
  };

  const query = <T>(selector: (reader: ReplicaReader) => T): T => selector(reader);

  const subscribe = <T>(
    selector: (reader: ReplicaReader) => T,
    listener: (result: T) => void,
  ): (() => void) => {
    let last = selector(reader);
    listener(last);
    return replica.onChange(() => {
      const next = selector(reader);
      if (!deepEqual(last, next)) {
        last = next;
        listener(next);
      }
    });
  };

  const requireTransport = (): SyncTransport => {
    if (!options.transport) {
      throw new Error('Engine 无同步传输层（离线引擎不能 flush/pull）');
    }
    return options.transport;
  };

  const flush = async (): Promise<void> => {
    const transport = requireTransport();
    for (;;) {
      const batch = replica.takeOutbox();
      if (batch.length === 0) return;
      await transport.push({
        deviceId: options.deviceId,
        events: batch.map((item) => item.event),
      });
      replica.deleteOutbox(batch.map((item) => item.rowId));
    }
  };

  const applyPull = async (): Promise<void> => {
    const transport = requireTransport();
    const response = await transport.pull({ cursor: replica.getCursor() });
    if (response.resync) {
      await bootstrap();
      return;
    }
    for (const change of response.changes) {
      if (change.kind === 'entity') {
        replica.applyRemoteEntity(change.entity, change.id, {
          fields: change.fields,
          clocks: change.clocks,
        });
      } else {
        replica.applyCompact(change.entity, change.ids);
      }
    }
    replica.setCursor(response.cursor);
  };

  const bootstrap = async (): Promise<void> => {
    const transport = requireTransport();
    const response = await transport.bootstrap();
    replica.replaceAll(response.snapshot);
    replica.setCursor(response.cursor);
  };

  return {
    deviceId: options.deviceId,
    query,
    subscribe,
    list: reader.list,
    get: reader.get,
    create: (entity, values) => replica.create(entity, values),
    update: (entity, id, patch) => replica.update(entity, id, patch),
    pendingCount: () => replica.outboxCount(),
    flush,
    pull: applyPull,
    async sync() {
      await flush();
      await applyPull();
    },
    bootstrap,
    cursor: () => replica.getCursor(),
    close: () => options.storage.close(),
  };
}

/**
 * 便捷：为带 Position 的实体生成「插在某行之后」的位次。
 * afterId 为 null 表示插在最前。
 */
export function positionAfter(rows: { id: string; fields: WireRow }[], afterId: string | null): string {
  const ordered = rows.map((row) => row.fields.position).filter((p): p is string => typeof p === 'string');
  if (ordered.length === 0) return positionBetween(null, null);
  if (afterId === null) return positionBetween(null, ordered[0]);
  const index = rows.findIndex((row) => row.id === afterId);
  if (index === -1 || index === rows.length - 1) {
    return positionBetween(ordered[ordered.length - 1], null);
  }
  const a = rows[index].fields.position;
  const b = rows[index + 1].fields.position;
  if (typeof a === 'string' && typeof b === 'string') {
    return positionBetween(a, b);
  }
  return positionBetween(null, null);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
