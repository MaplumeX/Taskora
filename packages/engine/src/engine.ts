/**
 * Engine 门面 — UI 的唯一读写入口（CONTEXT.md「引擎与同步」）。
 *
 * 读：get/list/query 直接作用于 Local Replica，零网络往返；视图经 watch
 * 订阅，写入提交后只重跑受影响的查询。写：create/update 落库
 * 同时进 Outbox（字段级 HLC + device id）；flush 把 Outbox 推给 Sync
 * Hub，pull 凭 Sync Cursor 拉全局增量。断网时全功能可用，恢复联网后
 * 自动收敛。
 *
 * 注意：所有方法为异步（存储接口面向 Tauri IPC 异步桥）。UI 经 watch
 * 订阅响应式查询（local-first-v3 issue 06），onChange 是其底层通知。
 */

import {
  LocalReplica,
  type EngineChange,
  type ListOptions,
  type OutboxEntry,
  type ReplicaRow,
} from './replica';
import { HybridClock } from './hlc';
import { positionAfterRow, positionAtStart } from './domain/order';
import { MAX_POSITION_LENGTH, rebalanceSegments } from './position';
import type { SyncEntity, WireRow } from './entities';
import { archiveCutoff, DEFAULT_ARCHIVE_AFTER_DAYS } from './archive';
import {
  COMPACT_REGISTRY_RETENTION_DAYS,
  NUMERIC_HLC_PROTOCOL,
  SYNC_PROTOCOL_VERSION,
  SyncUpgradeRequiredError,
  type DeleteRequest,
  type HubVersionInfo,
  type OutboxEvent,
  type SyncTransport,
} from './protocol';
import type { SqlStorage } from './storage';
import { watchQuery, type LiveQuery, type QueryObserver, type QueryWatch } from './live-query';

export interface EngineOptions {
  storage: SqlStorage;
  deviceId: string;
  /** 缺省时为离线引擎（读写全功能，仅无同步）。 */
  transport?: SyncTransport;
  /** 可注入的 HLC（测试确定性）。 */
  clock?: HybridClock;
  generateId?: () => string;
  /**
   * 副本保留已了结任务的天数（issue 08，缺省 DEFAULT_ARCHIVE_AFTER_DAYS）；
   * 更早的归档任务不进快照、定期从副本裁掉。null：副本保留全部历史。
   */
  archiveAfterDays?: number | null;
  /** 墙钟（毫秒；归档截止与登记过期，测试确定性）。 */
  now?: () => number;
}

export interface Engine {
  readonly deviceId: string;
  /** 取单个实体行（含 id），不存在返回 null。 */
  get(entity: SyncEntity, id: string): Promise<ReplicaRow | null>;
  /**
   * 列出某实体的行（按 Position 排序）。options.where 在 SQL
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
  /** flush + pull（正常在线同步路径），到期时顺带 maintain。 */
  sync(): Promise<void>;
  /**
   * 从 hub 快照重建本地副本（保留未同步 Outbox）。快照按页拉取；新设备
   * 各页到达即可见，已有数据的副本在最后一页到齐后整体替换。
   */
  bootstrap(): Promise<void>;
  /**
   * 副本维护（issue 08）：裁掉归档任务、清理过期的 Compact 登记。sync
   * 每小时至多自动跑一次；纯本地操作，不需要网络。
   */
  maintain(): Promise<void>;
  /** 当前 Sync Cursor。 */
  cursor(): Promise<number>;
  /** 订阅数据变更（本地写 / 应用远端写 / bootstrap 重建后触发，载荷
   * 携带来源与涉及实体；UI 层自行选择失效策略）。返回退订函数。 */
  onChange(listener: (change: EngineChange) => void): () => void;
  /**
   * 响应式查询（local-first-v3 issue 06）：立即运行，之后只在影响其依赖
   * 的变更提交后重跑，结果与上次结构相同则不推送。
   */
  watch<T>(query: LiveQuery<T>, observer: QueryObserver<T>): QueryWatch;
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

/** sync 自动维护副本的最短间隔。 */
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

/** 一次向 hub 取回的归档任务数上限。 */
const BACKFILL_BATCH = 200;

export async function openEngine(options: EngineOptions): Promise<Engine> {
  const now = options.now ?? (() => Date.now());
  const replica = new LocalReplica(options.storage, {
    deviceId: options.deviceId,
    clock: options.clock,
    generateId: options.generateId,
    now,
  });
  await replica.init();
  const archiveAfterDays =
    options.archiveAfterDays === undefined ? DEFAULT_ARCHIVE_AFTER_DAYS : options.archiveAfterDays;
  const currentArchiveCutoff = (): string | undefined =>
    archiveAfterDays === null ? undefined : archiveCutoff(now(), archiveAfterDays);
  /** hub 上次回报的协议版本（新端点只在 hub 声明支持后调用）。 */
  let hubProtocol = 0;
  let lastMaintenance = Number.NEGATIVE_INFINITY;

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
    hubProtocol = response.protocolVersion ?? 0;
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
        console.warn(
          '[engine] hub 无法处理部分变更，保留在 Outbox 待 hub 升级后重推',
          response.rejected,
        );
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
      await replica.applyRemoteBatch(response.changes, response.cursor, {
        archiveCutoff: currentArchiveCutoff(),
      });
      if (!response.hasMore || response.cursor <= cursor) break;
    }
    await backfillArchived();
  };

  /**
   * 回到副本的归档任务补齐 Subtask（issue 08，见 applyRemoteBatch）：向
   * hub 按 id 取任务及其子实体，按 LWW 合并。hub 不支持（协议 2 以下）时
   * 名单留着，hub 升级后再补。
   */
  const backfillArchived = async (): Promise<void> => {
    const transport = requireTransport();
    if (!transport.fetchEntities || hubProtocol < 2) return;
    const pending = await replica.pendingBackfill();
    for (let index = 0; index < pending.length; index += BACKFILL_BATCH) {
      const ids = pending.slice(index, index + BACKFILL_BATCH);
      const response = await calibrated(() => transport.fetchEntities!({ entity: 'task', ids }));
      await replica.applyRemoteEntries(response.entries, ids);
    }
  };

  const bootstrap = async (): Promise<void> => {
    const transport = requireTransport();
    await replica.beginBootstrap();
    // 各页的 cursor 都是第一页之前固定的 fence；归档截止时刻由 hub 记在
    // 分页令牌里，全程一致。
    let response = await calibrated(() =>
      transport.bootstrap({ settledAfter: currentArchiveCutoff() }),
    );
    const fence = response.cursor;
    for (;;) {
      await replica.stageSnapshot(response.snapshot, response.compacted);
      const next = response.next;
      if (!next) break;
      response = await calibrated(() => transport.bootstrap({ page: next }));
    }
    await replica.finishBootstrap(fence);
  };

  const maintain = async (): Promise<void> => {
    lastMaintenance = now();
    const cutoff = currentArchiveCutoff();
    if (cutoff) await replica.pruneArchive(cutoff);
    await replica.expireCompacted(now() - COMPACT_REGISTRY_RETENTION_DAYS * 24 * 3600 * 1000);
  };

  /**
   * feed 排序键空间的 re-balance：任务 Position 与项目 Feed Position 在
   * feed 中混排（feedSortKey），必须合成一张有序表一起修，否则只重排
   * 任务会把夹在它们之间的项目行挪到错误的一侧。任务 Position 只在这里
   * re-balance；顺序保持不变，任务之间的相对顺序（项目页等）同样不变。
   */
  const rebalanceFeedKeys = async (): Promise<void> => {
    const inflated =
      (await replica.countInflatedPositions('task', MAX_POSITION_LENGTH)) +
      (await replica.countInflatedPositions('project', MAX_POSITION_LENGTH, 'feedPosition'));
    if (inflated === 0) return;
    const merged = [
      ...(await replica.positionKeys('task')).map((row) => ({ ...row, id: `task:${row.id}` })),
      ...(await replica.positionKeys('project', 'feedPosition')).map((row) => ({
        ...row,
        id: `project:${row.id}`,
      })),
    ].sort(
      (a, b) =>
        (a.position < b.position ? -1 : a.position > b.position ? 1 : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const changes = rebalanceSegments(merged);
    const pick = (prefix: string) =>
      changes
        .filter(({ id }) => id.startsWith(prefix))
        .map(({ id, position }) => ({ id: id.slice(prefix.length), position }));
    await replica.updateMany(
      'task',
      pick('task:').map(({ id, position }) => ({ id, patch: { position } })),
    );
    await replica.updateMany(
      'project',
      pick('project:').map(({ id, position }) => ({ id, patch: { feedPosition: position } })),
    );
  };

  /**
   * Position re-balance（ADR-0007）：出现超长键（反复插队的痕迹）时，
   * 只重排膨胀键所在的那一段，作为普通字段写入（走 LWW，推送 hub）。
   * 每次同步都会跑：先在 SQLite 里计数，平时不传输任何行；真有膨胀时
   * 也只取 id / position 两列。
   */
  const rebalanceIfInflated = async (): Promise<void> => {
    await rebalanceFeedKeys();
    for (const entity of [
      'project',
      'tag',
      'area',
      'project-heading',
      'tag-group',
      'subtask',
    ] as SyncEntity[]) {
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
      // 旧版小数墙钟时间戳的一次性修复（见 repairFractionalClocks）：hub
      // 按数值裁决后才重推，再走一轮 flush + bootstrap 收敛
      if (hubProtocol >= NUMERIC_HLC_PROTOCOL && (await replica.repairFractionalClocks())) {
        await flush();
        await applyPull();
      }
      await rebalanceIfInflated();
      if (now() - lastMaintenance >= MAINTENANCE_INTERVAL_MS) await maintain();
    },
    bootstrap,
    maintain,
    cursor: () => replica.getCursor(),
    onChange: (listener) => replica.onChange(listener),
    watch: (query, observer) => watchQuery(replica, query, observer),
    close: () => options.storage.close(),
  };
}

/**
 * 便捷：为带 Position 的实体生成「插在某行之后」的位次。
 * afterId 为 null 表示插在最前；afterId 不在 rows 里时追加到末尾。
 */
export function positionAfter(
  rows: { id: string; fields: WireRow }[],
  afterId: string | null,
): string {
  const positioned = rows.map((row) => ({
    id: row.id,
    position: typeof row.fields.position === 'string' ? row.fields.position : null,
  }));
  return afterId === null ? positionAtStart(positioned) : positionAfterRow(positioned, afterId);
}
