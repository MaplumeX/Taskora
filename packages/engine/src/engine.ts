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

import {
  LocalReplica,
  type EngineChange,
  type ListOptions,
  type OutboxEntry,
  type ReplicaRow,
} from './replica';
import { HybridClock } from './hlc';
import {
  MAX_POSITION_LENGTH,
  positionBetween,
  rebalanceSegments,
  synthPosition,
} from './position';
import type { SyncEntity, WireRow } from './entities';
import {
  SYNC_PROTOCOL_VERSION,
  SyncUpgradeRequiredError,
  type DeleteRequest,
  type HubVersionInfo,
  type OutboxEvent,
  type SyncTransport,
} from './protocol';
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
  /**
   * 列出某实体的行（按 Position / sortOrder 排序）。options.where 在 SQL
   * 里预过滤（相等 / IS NULL / IS NOT NULL / IN），options.limit 取前 N 行。
   */
  list(entity: SyncEntity, options?: ListOptions): Promise<ReplicaRow[]>;
  /** 创建实体，返回 id。 */
  create(entity: SyncEntity, values: WireRow): Promise<string>;
  /** 更新实体字段（软删除即更新 trashedAt 等字段）。 */
  update(entity: SyncEntity, id: string, patch: WireRow): Promise<void>;
  /** 批量更新同一实体的多行：一个事务、一次变更通知（重排等多行写）。 */
  updateMany(entity: SyncEntity, patches: Array<{ id: string; patch: WireRow }>): Promise<void>;
  /**
   * 设备发起的物理删除（Delete Request，ADR-0008）：立即从副本移除
   * （级联 Subtask、清理引用），并把删除请求排进 Outbox；flush 推给
   * hub，hub 校验归属后删除并广播 Compact Event。幂等可重放。
   */
  delete(entity: SyncEntity, ids: string[]): Promise<void>;
  /** Outbox 未同步条数（诊断/测试）。 */
  pendingCount(): Promise<number>;
  /**
   * 该 id 是否已被 compact（ADR-0008；Repeat 派生的死 id 检测）。异步：
   * web 的非 leader 标签页经 leader 代理 Engine（local-first-v3 issue 05）。
   */
  isCompacted(entity: SyncEntity, id: string): Promise<boolean>;
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

/**
 * 单次 push 的序列化体积上限。hub 的请求体有上限，超限请求被整批拒绝
 * 后设备会原样重放——永远同一批、永远失败。按体积截断批次（至少带一条），
 * 余下留给 flush 循环的下一轮；Outbox 是因果序，任意前缀都可独立提交。
 */
export const MAX_PUSH_BATCH_BYTES = 256 * 1024;

function limitBatchBytes(batch: OutboxEntry[]): OutboxEntry[] {
  let bytes = 0;
  for (let index = 0; index < batch.length; index += 1) {
    const entry = batch[index];
    bytes += entry.kind === 'write' ? JSON.stringify(entry.event).length : 128;
    if (bytes > MAX_PUSH_BATCH_BYTES && index > 0) return batch.slice(0, index);
  }
  return batch;
}

/** 往返超过此值的响应不用于时钟校准（单程延迟不对称的误差太大）。 */
const MAX_CALIBRATION_RTT_MS = 5_000;

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

  /**
   * 调用 hub 并按其回报的服务器时间校准 HLC 墙钟：偏移 = 服务器时间 −
   * 请求往返的中点（NTP 式估计）。hub 未回报时不动。
   */
  const calibrated = async <T extends HubVersionInfo & { serverTime?: number }>(
    call: () => Promise<T>,
  ): Promise<T> => {
    const sentAt = replica.rawWallMs();
    const response = await call();
    // 兜底：hub 声明的最低版本高于本端（正常情况下 hub 直接回 426，
    // transport 抛同一个错误）。
    if ((response.minProtocolVersion ?? 0) > SYNC_PROTOCOL_VERSION) {
      throw new SyncUpgradeRequiredError(response.minProtocolVersion);
    }
    const receivedAt = replica.rawWallMs();
    if (typeof response.serverTime === 'number' && receivedAt - sentAt <= MAX_CALIBRATION_RTT_MS) {
      await replica.calibrateWall(response.serverTime - (sentAt + receivedAt) / 2);
    }
    return response;
  };

  const flush = async (): Promise<void> => {
    const transport = requireTransport();
    // hub 拒绝的条目（hub 过旧、不认识的实体 / 字段，协议 1 起）留在
    // Outbox：本轮跳过继续推后面的，以后的同步重推，hub 升级后被接受。
    const rejectedRowIds: number[] = [];
    for (;;) {
      const batch = limitBatchBytes(await replica.takeOutbox(500, rejectedRowIds));
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
      const response = await calibrated(() =>
        transport.push({
          deviceId: options.deviceId,
          events,
          ...(deletes.length > 0 ? { deletes } : {}),
        }),
      );
      const rejected = new Set(
        (response.rejected ?? []).map((item) => `${item.kind}:${item.entity}:${item.id}`),
      );
      const accepted: OutboxEntry[] = [];
      for (const item of batch) {
        const key =
          item.kind === 'write'
            ? `write:${item.event.entity}:${item.event.id}`
            : `delete:${item.entity}:${item.id}`;
        if (rejected.has(key)) rejectedRowIds.push(item.rowId);
        else accepted.push(item);
      }
      if (rejected.size > 0) {
        console.warn('[engine] hub 无法处理部分变更，保留在 Outbox 待 hub 升级后重推', response.rejected);
      }
      await replica.deleteOutbox(accepted);
    }
  };

  const applyPull = async (): Promise<void> => {
    const transport = requireTransport();
    // hub 分页返回：hasMore 时继续拉，直到追平
    for (;;) {
      const cursor = await replica.getCursor();
      const response = await calibrated(() => transport.pull({ cursor }));
      if (response.resync) {
        await bootstrap();
        return;
      }
      await replica.applyRemoteBatch(response.changes, response.cursor);
      if (!response.hasMore || response.cursor <= cursor) return;
    }
  };

  const bootstrap = async (): Promise<void> => {
    const transport = requireTransport();
    const response = await calibrated(() => transport.bootstrap());
    await replica.replaceAll(response.snapshot, response.compacted);
    await replica.setCursor(response.cursor);
  };

  /**
   * Position re-balance（ADR-0007）：出现超长键（反复插队的痕迹）时，
   * 只重排膨胀键所在的那一段，作为普通字段写入（走 LWW，推送 hub）。
   * 每次同步都会跑：先在 SQLite 里计数，平时不传输任何行；真有膨胀时
   * 也只取 id / position 两列。
   */
  const rebalanceIfInflated = async (): Promise<void> => {
    for (const entity of ['task', 'project', 'tag'] as SyncEntity[]) {
      if ((await replica.countInflatedPositions(entity, MAX_POSITION_LENGTH)) === 0) continue;
      const changes = rebalanceSegments(await replica.positionKeys(entity));
      await replica.updateMany(
        entity,
        changes.map(({ id, position }) => ({ id, patch: { position } })),
      );
    }
  };

  return {
    deviceId: options.deviceId,
    get: async (entity, id) => {
      const state = await replica.get(entity, id);
      if (!state) return null;
      return { id, fields: state.fields };
    },
    list: (entity, options) => replica.list(entity, options),
    create: (entity, values) => replica.create(entity, values),
    update: (entity, id, patch) => replica.update(entity, id, patch),
    updateMany: (entity, patches) => replica.updateMany(entity, patches),
    delete: (entity, ids) =>
      replica.requestDelete(
        entity,
        ids.filter((id) => typeof id === 'string'),
      ),
    pendingCount: () => replica.outboxCount(),
    isCompacted: async (entity, id) => replica.isCompacted(entity, id),
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
