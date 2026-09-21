/**
 * Engine 门面 — UI 的唯一读写入口（CONTEXT.md「引擎与同步」）。
 *
 * 读：get/list/query 直接作用于 Local Replica，零网络往返；写后由订阅
 * 者（桌面端为 React Query invalidate，按变更携带的实体粒度）刷新视图。写：create/update 落库
 * 同时进 Outbox（字段级 HLC + device id）；flush 把 Outbox 推给 Sync
 * Hub，pull 凭 Sync Cursor 拉全局增量。断网时全功能可用，恢复联网后
 * 自动收敛。
 *
 * 注意：所有方法为异步（存储接口面向 Tauri IPC 异步桥）。响应式刷新
 * 由 onChange 通知驱动，UI 层自行选择失效策略。
 */

import { LocalReplica, type EngineChange, type ReplicaRow } from './replica';
import { HybridClock } from './hlc';
import { positionBetween, rebalancePositions, synthPosition } from './position';
import type { SyncEntity, WireRow } from './entities';
import type { DeleteRequest, OutboxEvent, SyncTransport } from './protocol';
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
  /** 取单个实体行（含 id），不存在返回 null。 */
  get(entity: SyncEntity, id: string): Promise<ReplicaRow | null>;
  /** 列出某实体的全部行（按 Position / sortOrder 排序）。 */
  list(entity: SyncEntity): Promise<ReplicaRow[]>;
  /** 创建实体，返回 id。 */
  create(entity: SyncEntity, values: WireRow): Promise<string>;
  /** 更新实体字段（软删除即更新 trashedAt 等字段）。 */
  update(entity: SyncEntity, id: string, patch: WireRow): Promise<void>;
  /**
   * 设备发起的物理删除（Delete Request，ADR-0008）：立即从副本移除
   * （级联 Subtask、清理引用），并把删除请求排进 Outbox；flush 推给
   * hub，hub 校验归属后删除并广播 Compact Event。幂等可重放。
   */
  delete(entity: SyncEntity, ids: string[]): Promise<void>;
  /** Outbox 未同步条数（诊断/测试）。 */
  pendingCount(): Promise<number>;
  /** 把 Outbox 推给 Sync Hub；成功后清空已推条目。 */
  flush(): Promise<void>;
  /** 凭 Sync Cursor 拉取增量并应用；resync 时自动 bootstrap。 */
  pull(): Promise<void>;
  /** flush + pull（正常在线同步路径）。 */
  sync(): Promise<void>;
  /** 从 hub 全量快照重建本地副本（保留未同步 Outbox）。 */
  bootstrap(): Promise<void>;
  /** 当前 Sync Cursor。 */
  cursor(): Promise<number>;
  /** 订阅数据变更（本地写 / 应用远端写 / bootstrap 重建后触发，载荷
   * 携带来源与涉及实体；UI 层自行选择失效策略）。返回退订函数。 */
  onChange(listener: (change: EngineChange) => void): () => void;
  close(): Promise<void>;
}

export async function openEngine(options: EngineOptions): Promise<Engine> {
  const replica = new LocalReplica(options.storage, {
    deviceId: options.deviceId,
    clock: options.clock,
    generateId: options.generateId,
  });
  await replica.init();

  const requireTransport = (): SyncTransport => {
    if (!options.transport) {
      throw new Error('Engine 无同步传输层（离线引擎不能 flush/pull）');
    }
    return options.transport;
  };

  const flush = async (): Promise<void> => {
    const transport = requireTransport();
    for (;;) {
      const batch = await replica.takeOutbox();
      if (batch.length === 0) return;
      const events: OutboxEvent[] = [];
      const deletesByEntity = new Map<SyncEntity, string[]>();
      for (const item of batch) {
        if (item.kind === 'write') {
          events.push(item.event);
        } else {
          const ids = deletesByEntity.get(item.entity) ?? [];
          ids.push(item.id);
          deletesByEntity.set(item.entity, ids);
        }
      }
      const deletes: DeleteRequest[] = [...deletesByEntity].map(([entity, ids]) => ({
        entity,
        ids,
      }));
      await transport.push({
        deviceId: options.deviceId,
        events,
        ...(deletes.length > 0 ? { deletes } : {}),
      });
      await replica.deleteOutbox(batch);
    }
  };

  const applyPull = async (): Promise<void> => {
    const transport = requireTransport();
    const response = await transport.pull({ cursor: await replica.getCursor() });
    if (response.resync) {
      await bootstrap();
      return;
    }
    for (const change of response.changes) {
      if (change.kind === 'entity') {
        await replica.applyRemoteEntity(change.entity, change.id, {
          fields: change.fields,
          clocks: change.clocks,
        });
      } else {
        await replica.applyCompact(change.entity, change.ids);
      }
    }
    await replica.setCursor(response.cursor);
  };

  const bootstrap = async (): Promise<void> => {
    const transport = requireTransport();
    const response = await transport.bootstrap();
    await replica.replaceAll(response.snapshot, response.compacted);
    await replica.setCursor(response.cursor);
  };

  /**
   * Position re-balance（ADR-0007）：带 Position 的实体出现超长键
   * （反复插队的痕迹）时，为整组重新分配短小等距键并作为普通字段写
   * 入（走 LWW，推送 hub）。仅在真正膨胀时触发，平时零成本。
   */
  const rebalanceIfInflated = async (): Promise<void> => {
    for (const entity of ['task', 'project', 'tag'] as SyncEntity[]) {
      const rows = await replica.list(entity);
      const keys = rows
        .map((row) => row.fields.position)
        .filter((key): key is string => typeof key === 'string');
      const rebalanced = rebalancePositions(keys);
      if (!rebalanced) continue;
      let index = 0;
      for (const row of rows) {
        if (typeof row.fields.position === 'string') {
          await replica.update(entity, row.id, { position: rebalanced[index] });
          index += 1;
        }
      }
    }
  };

  return {
    deviceId: options.deviceId,
    get: async (entity, id) => {
      const state = await replica.get(entity, id);
      if (!state) return null;
      return { id, fields: state.fields };
    },
    list: (entity) => replica.list(entity),
    create: (entity, values) => replica.create(entity, values),
    update: (entity, id, patch) => replica.update(entity, id, patch),
    delete: (entity, ids) =>
      replica.requestDelete(
        entity,
        ids.filter((id) => typeof id === 'string'),
      ),
    pendingCount: () => replica.outboxCount(),
    flush,
    pull: applyPull,
    async sync() {
      await flush();
      await applyPull();
      await rebalanceIfInflated();
    },
    bootstrap,
    cursor: () => replica.getCursor(),
    onChange: (listener) => replica.onChange(listener),
    close: () => options.storage.close(),
  };
}

/**
 * 便捷：为带 Position 的实体生成「插在某行之后」的位次。
 * afterId 为 null 表示插在最前。邻居缺 Position（理论仅防御：hub wire
 * 与本地写总是携带）时，按 sortOrder + createdAt 合成兜底——与 hub
 * 对 legacy 行的合成口径一致，而不是「插到最前」（positionBetween(null,
 * null) 恒为 a0，会让「追加末尾」变成「排到最前」）。
 */
export function positionAfter(
  rows: { id: string; fields: WireRow }[],
  afterId: string | null,
): string {
  const positionOfRow = (row: { fields: WireRow }): string | null => {
    if (typeof row.fields.position === 'string') return row.fields.position;
    const sortOrder = typeof row.fields.sortOrder === 'number' ? row.fields.sortOrder : 0;
    const createdAt =
      typeof row.fields.createdAt === 'string' && !Number.isNaN(Date.parse(row.fields.createdAt))
        ? new Date(row.fields.createdAt)
        : new Date();
    return synthPosition(sortOrder, createdAt);
  };
  const ordered = rows
    .map((row) => positionOfRow(row))
    .filter((p): p is string => typeof p === 'string');
  if (ordered.length === 0) return positionBetween(null, null);
  if (afterId === null) return positionBetween(null, ordered[0]);
  const index = rows.findIndex((row) => row.id === afterId);
  if (index === -1 || index === rows.length - 1) {
    return positionBetween(ordered[ordered.length - 1], null);
  }
  const a = positionOfRow(rows[index]);
  const b = positionOfRow(rows[index + 1]);
  if (typeof a === 'string' && typeof b === 'string') {
    return positionBetween(a, b);
  }
  return positionBetween(ordered[ordered.length - 1], null);
}
