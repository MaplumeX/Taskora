/**
 * Local Replica（本地副本）— 每台设备持有的该用户全量数据镜像，
 * UI 读写的直接对象（CONTEXT.md「引擎与同步」）。不可视为可随时丢弃
 * 的缓存：断网时它是 Outbox 中未同步编辑的唯一载体。
 *
 * 职责：
 * - 实体行的存取（SQLite schema 见 entities.ts）；
 * - 本地写：字段打 HLC 时间戳、落库、进 Outbox（可合并同类 pending）；
 * - 远端写：按字段级 LWW 合并拉取的变更（同 hub 的合并器）；
 * - Compact Event：物理移除实体行；
 * - 快照重建（bootstrap）：分页暂存、整表替换、保留未同步 Outbox；
 * - 归档裁剪与 Compact 登记过期（local-first-v3 issue 08）；
 * - 变更通知：任何本地/应用远端写都推进版本号、通知订阅者。
 *
 * 存储接口为异步（Tauri IPC 场景），方法均返回 Promise。
 */

import { ProjectStatus, SETTLED_TASK_STATUSES } from '@taskora/shared';

import {
  COMPACT_NULL_REFS,
  DELETE_CASCADES,
  entityDef,
  entityTableDdl,
  isSyncEntity,
  SYNC_ENTITIES,
  type FieldDef,
  type SyncEntity,
  type WireRow,
} from './entities';
import { compareHlc, HybridClock, isLegacyFractionalHlc } from './hlc';
import { migrateReplica } from './migrations';
import { mergeEntityState, type EntityMergeState, type FieldWrite } from './merger';
import type { DeleteRequest, HubChange, OutboxEvent, SnapshotEntry } from './protocol';
import { inTransaction, type SqlStorage } from './storage';

/** bootstrap 暂存表（与实体表同列）。 */
function stageTable(entity: SyncEntity): string {
  return `_stage_${entityDef(entity).table}`;
}

/** 一次归档裁剪事务最多删除的任务数（事务短、SQL 参数个数有界）。 */
const PRUNE_CHUNK = 500;

/** 待补齐 Subtask 的回到副本的归档任务（_engine_meta 键）。 */
const BACKFILL_META_KEY = 'archiveBackfill';

/** 小数墙钟时间戳的一次性修复已完成（_engine_meta 键，见 repairFractionalClocks）。 */
const CLOCK_REPAIR_META_KEY = 'fractionalClockRepair';

/** 修复重推的实体顺序：被引用者在前。 */
const REPAIR_ORDER: SyncEntity[] = [
  'tag-group',
  'tag',
  'area',
  'project',
  'project-heading',
  'task',
  'subtask',
];

export interface ReplicaRow {
  id: string;
  fields: WireRow;
}

/**
 * list 的 SQL 预过滤条件（按字段）：相等、IS NULL（null）、IS NOT NULL
 * （{ notNull: true }）、IN（{ in: [...] }）。字段名按实体定义白名单校验，
 * JSON 字段不可用。调用方用它先筛掉明显无关的行（如只增不减的 Logbook），
 * 精确的视图语义仍由调用方在 JS 里判定。
 */
export type ListWhereValue =
  string | number | null | { notNull: true } | { in: Array<string | number> };
export type ListWhere = Record<string, ListWhereValue>;

export interface ListOptions {
  where?: ListWhere;
  /** 只取按列表序的前 N 行（如取首行位次）。 */
  limit?: number;
}

/**
 * 变更通知载荷：来源 + 涉及实体。bootstrap 整表重建时 entities 缺省
 * （表示全部）。UI 据此选择失效粒度，并区分「本地写需要防抖同步」
 * 与「远端写应用后无需再拉」。
 *
 * ids：已知的变更行 id（按实体）。entities 里有、ids 里没有的实体表示
 * 「行未知」（级联删除、引用清理波及的行），按整个实体变更处理。响应式
 * 查询据此只重跑真正受影响的单行查询（local-first-v3 issue 06）。
 */
export interface EngineChange {
  origin: 'local' | 'remote' | 'bootstrap';
  entities?: SyncEntity[];
  ids?: Partial<Record<SyncEntity, string[]>>;
}

/** 变更行登记：已知 id 的实体与行未知的实体（后者覆盖前者）。 */
class ChangedRows {
  readonly entities = new Set<SyncEntity>();
  private readonly known = new Map<SyncEntity, Set<string>>();
  private readonly unknown = new Set<SyncEntity>();

  rows(entity: SyncEntity, ids: Iterable<string>): void {
    this.entities.add(entity);
    const set = this.known.get(entity) ?? new Set<string>();
    for (const id of ids) set.add(id);
    this.known.set(entity, set);
  }

  whole(entity: SyncEntity): void {
    this.entities.add(entity);
    this.unknown.add(entity);
  }

  toChange(origin: 'local' | 'remote'): EngineChange {
    const ids: Partial<Record<SyncEntity, string[]>> = {};
    for (const [entity, set] of this.known) {
      if (!this.unknown.has(entity)) ids[entity] = [...set];
    }
    return { origin, entities: [...this.entities], ids };
  }
}

/**
 * 写入值归一化：与 hub 侧落库口径对齐——sortOrder 是 Prisma 不可空列
 * （Int @default(0)），null 落库后变 0；tagIds 经关系表读回时排序。
 * 设备本地值与 hub 合并态保持逐字段一致，自身回声在 LWW 平局
 * （时钟持平、保留本地）下不会留下两端口径分叉。
 */
function normalizeWriteValue(field: FieldDef, value: unknown): unknown {
  if (field.name === 'sortOrder' && value == null) return 0;
  if (field.name === 'tagIds' && Array.isArray(value)) return [...value].sort();
  return value;
}

/** Outbox 条目：普通字段写，或设备发起的 Delete Request（ADR-0008）。 */
export type OutboxEntry =
  | { rowId: number; revision: number; kind: 'write'; event: OutboxEvent }
  | { rowId: number; revision: number; kind: 'delete'; entity: SyncEntity; id: string };

export interface LocalReplicaOptions {
  deviceId: string;
  clock?: HybridClock;
  /** id 生成器（测试确定性）。 */
  generateId?: () => string;
  /** 墙钟（毫秒；Compact 登记时刻，测试确定性）。 */
  now?: () => number;
}

/** 位次列名（拼进 SQL，只接受实体注册表里的非 JSON 字段）。 */
function positionColumn(entity: SyncEntity, field: string): string {
  const def = entityDef(entity);
  if (!def.fields.some((candidate) => candidate.name === field && !candidate.json)) {
    throw new Error(`positionKeys: ${entity} 没有位次字段 ${field}`);
  }
  return field;
}

export class LocalReplica {
  private readonly clock: HybridClock;
  private readonly generateId: () => string;
  private listeners = new Set<(change: EngineChange) => void>();
  private changeVersion = 0;
  /**
   * Compact 登记（ADR-0008）：已被 compact 的实体 id。迟到的远端字段
   * 变更到达这些 id 时被静默丢弃（Compact 永久获胜，副本与 hub 同规则）。
   * 内存集合是 `_compacted` 表的读缓存：必须跨会话持久——否则重启后
   * Repeat 派生会复用已死的确定性 id，本地建出 hub 永远丢弃的幽灵行。
   * 只有 id，不是墓碑。
   */
  private readonly compacted = new Set<string>();
  /** 写串行化：异步存储下防止并发写的 BEGIN/COMMIT 交错。 */
  private writeChain: Promise<unknown> = Promise.resolve();
  /**
   * 进行中的写事务。存储是单连接（Tauri IPC 共享同一个 rusqlite 连接），
   * 事务外的读会读到事务中间态——bootstrap 整表替换期间 UI 读到空表。
   * 公共读等待它结束；事务体内部只用 getRaw，不经过这道闸。
   */
  private activeTx: Promise<void> | null = null;
  /**
   * HLC 前进后尚未落库。由 tx() 在提交前写入 _engine_meta——与用到这些
   * 时间戳的行同事务，跨会话时间戳不回退（否则同设备可能发出重复时间戳）。
   * 以前是事务外 fire-and-forget，可能插进别的事务或在崩溃时丢失。
   */
  private clockDirty = false;
  /** 进行中的 bootstrap 是否把各页直接写进副本（新设备，见 beginBootstrap）。 */
  private bootstrapLive = false;

  constructor(
    private readonly storage: SqlStorage,
    private readonly options: LocalReplicaOptions,
  ) {
    this.clock = options.clock ?? new HybridClock(options.deviceId);
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  // ---------- 生命周期 ----------

  /** 建表 + 恢复持久化的 HLC 状态；device id 落 meta（设备身份存于
   * Local Replica，ADR-0007：决胜与审计有稳定主体）。 */
  async init(): Promise<void> {
    // schema 版本与迁移（local-first-v3 issue 03）：新建、升级旧库，
    // 或拒绝打开更新版本写入的副本（ReplicaSchemaTooNewError）。
    await migrateReplica(this.storage);
    await this.metaSet('deviceId', this.options.deviceId);
    await this.reloadCompacted();
    const offset = Number(await this.metaGet('wallOffset'));
    if (Number.isFinite(offset)) this.clock.setWallOffset(offset);
    const saved = await this.metaGet('hlc');
    if (saved) {
      const state = JSON.parse(saved) as { wallMs: number; counter: number };
      this.clock.restoreState(state);
    }
  }

  /**
   * 一次性修复旧版小数墙钟时间戳（`1790857242098.5:…`，字典序压过一切正常
   * 时间戳）造成的分叉：hub 与各副本曾按字典序裁决，比它真正更新的写被
   * 丢弃——典型是新建任务（create 恰好带小数时间戳）之后输入的标题，本机
   * 可见，hub 与其他设备仍为空。
   *
   * 带这类时间戳的行按原时钟整行进 Outbox（不重新打时间戳），由按数值
   * 裁决的 hub（协议 3）接受当初被丢弃的写；游标归零，随后的 pull 走
   * bootstrap，本机当初丢弃的远端写也一并收回。只做一次；返回是否有行
   * 需要重推。
   */
  async repairFractionalClocks(): Promise<boolean> {
    return this.serialized(() => this.repairFractionalClocksInternal());
  }

  private async repairFractionalClocksInternal(): Promise<boolean> {
    if (await this.metaGet(CLOCK_REPAIR_META_KEY)) return false;
    return this.tx(async () => {
      let repaired = 0;
      for (const entity of REPAIR_ORDER) {
        const rows = await this.storage.all<Record<string, unknown>>(
          `SELECT * FROM ${entityDef(entity).table} WHERE clocks LIKE '%.%'`,
        );
        for (const row of rows) {
          const state = this.rowToState(entity, row);
          if (!Object.values(state.clocks).some(isLegacyFractionalHlc)) continue;
          const writes: Record<string, FieldWrite> = {};
          for (const [field, hlc] of Object.entries(state.clocks)) {
            writes[field] = { value: state.fields[field] ?? null, hlc };
          }
          await this.appendOutbox(entity, row.id as string, writes);
          repaired += 1;
        }
      }
      if (repaired > 0) await this.metaSet('syncCursor', '0');
      await this.metaSet(CLOCK_REPAIR_META_KEY, '1');
      return repaired > 0;
    });
  }

  get deviceId(): string {
    return this.options.deviceId;
  }

  /** 未校准的系统时钟读数（Engine 测量校准偏移用）。 */
  rawWallMs(): number {
    return this.clock.rawWallMs();
  }

  /**
   * 按 hub 回报的服务器时间校准 HLC 墙钟。偏移持久化：离线重启后仍用
   * 最后一次校准值。变化不足 1 秒的抖动不落库。
   */
  async calibrateWall(offsetMs: number): Promise<void> {
    const previous = this.clock.getWallOffset();
    this.clock.setWallOffset(offsetMs);
    if (Math.abs(offsetMs - previous) >= 1000) {
      await this.metaSet('wallOffset', String(Math.round(offsetMs)));
    }
  }

  async getCursor(): Promise<number> {
    return Number((await this.metaGet('syncCursor')) ?? '0');
  }

  async setCursor(seq: number): Promise<void> {
    await this.metaSet('syncCursor', String(seq));
  }

  /** 订阅数据变更；返回退订函数。 */
  onChange(listener: (change: EngineChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 串行执行一个写事务体（后续写排队等待）。 */
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(fn, fn);
    // 链上吞掉错误，避免后续写被前一个失败卡死
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** 写事务：inTransaction + 标记进行中（公共读据此等待）。 */
  private async tx<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    this.activeTx = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      return await inTransaction(this.storage, async () => {
        const result = await fn();
        if (this.clockDirty) {
          await this.metaSet('hlc', JSON.stringify(this.clock.getState()));
          this.clockDirty = false;
        }
        return result;
      });
    } finally {
      this.activeTx = null;
      release();
    }
  }

  private async readGate(): Promise<void> {
    while (this.activeTx) await this.activeTx;
  }

  private notifyChanged(change: EngineChange): void {
    this.changeVersion += 1;
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch {
        // 订阅者异常不得破坏写路径
      }
    }
  }

  // ---------- 读 ----------

  /** 实体合并态（字段 + 时钟），不存在返回 null。 */
  async get(entity: SyncEntity, id: string): Promise<EntityMergeState | null> {
    await this.readGate();
    return this.getRaw(entity, id);
  }

  /** 不经读闸的 get（仅供写事务体内部使用）。 */
  private async getRaw(entity: SyncEntity, id: string): Promise<EntityMergeState | null> {
    const def = entityDef(entity);
    const rows = await this.storage.all<Record<string, unknown>>(
      `SELECT * FROM ${def.table} WHERE id = ?`,
      [id],
    );
    return rows[0] ? this.rowToState(entity, rows[0]) : null;
  }

  /** 全量实体行（UI 查询面），按 Position / sortOrder 排序。 */
  async list(entity: SyncEntity, options: ListOptions = {}): Promise<ReplicaRow[]> {
    await this.readGate();
    const def = entityDef(entity);
    const order =
      def.orderField === 'position'
        ? 'ORDER BY position IS NULL ASC, position ASC, createdAt DESC'
        : 'ORDER BY sortOrder ASC, createdAt DESC';
    const conditions: string[] = [];
    const params: unknown[] = [];
    for (const [name, value] of Object.entries(options.where ?? {})) {
      const field = name === 'id' ? null : def.fields.find((candidate) => candidate.name === name);
      if (name !== 'id' && (!field || field.json)) {
        throw new Error(`list: ${entity} 不支持按 ${name} 过滤`);
      }
      if (value === null) {
        conditions.push(`${name} IS NULL`);
      } else if (typeof value === 'object' && 'notNull' in value) {
        conditions.push(`${name} IS NOT NULL`);
      } else if (typeof value === 'object') {
        if (value.in.length === 0) return [];
        conditions.push(`${name} IN (${value.in.map(() => '?').join(', ')})`);
        params.push(...value.in);
      } else {
        conditions.push(`${name} = ?`);
        params.push(value);
      }
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit =
      options.limit !== undefined ? `LIMIT ${Math.max(0, Math.floor(options.limit))}` : '';
    // 不取 clocks 列：UI 用不到，整表 JSON 经 IPC 传输再丢弃是纯浪费
    const columns = ['id', ...def.fields.map((field) => field.name)].join(', ');
    const rows = await this.storage.all<Record<string, unknown>>(
      `SELECT ${columns} FROM ${def.table} ${where} ${order} ${limit}`,
      params,
    );
    return rows.map((row) => {
      const { id, ...rest } = row;
      return { id: id as string, fields: this.decodeRow(entity, rest) };
    });
  }

  /**
   * 位次长度超过 maxLength 的行数（SQL 内计数，不传输行）。field 为位次
   * 字段（默认 position；project 另有 feedPosition）。
   */
  async countInflatedPositions(
    entity: SyncEntity,
    maxLength: number,
    field = 'position',
  ): Promise<number> {
    await this.readGate();
    const rows = await this.storage.all<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${entityDef(entity).table} WHERE length(${positionColumn(entity, field)}) > ?`,
      [maxLength],
    );
    return rows[0]?.count ?? 0;
  }

  /** 按位次升序的 { id, position }（只取两列，re-balance 用）。 */
  async positionKeys(
    entity: SyncEntity,
    field = 'position',
  ): Promise<Array<{ id: string; position: string }>> {
    await this.readGate();
    const column = positionColumn(entity, field);
    return this.storage.all<{ id: string; position: string }>(
      `SELECT id, ${column} AS position FROM ${entityDef(entity).table} WHERE ${column} IS NOT NULL ORDER BY ${column} ASC`,
    );
  }

  // ---------- 本地写（含 Delete Request，ADR-0008） ----------

  /**
   * 创建实体：未显式提供的字段取 null（tagIds 为 []），
   * createdAt/updatedAt 缺省为当前时间。每个字段打 HLC 时间戳并进 Outbox。
   */
  async create(entity: SyncEntity, values: WireRow): Promise<string> {
    return this.serialized(() => this.createInternal(entity, values));
  }

  private async createInternal(entity: SyncEntity, values: WireRow): Promise<string> {
    const def = entityDef(entity);
    const id = typeof values.id === 'string' ? values.id : this.generateId();
    const nowIso = new Date().toISOString();
    const fields: WireRow = {};
    for (const field of def.fields) {
      const provided = values[field.name];
      if (provided !== undefined) {
        fields[field.name] = normalizeWriteValue(field, provided);
      } else if (field.json) {
        // tagIds 缺省 []（关系数组）；其余 JSON 字段（repeatRule 规则对象）缺省 null
        fields[field.name] = field.name === 'tagIds' ? [] : null;
      } else if (field.name === 'createdAt' || field.name === 'updatedAt') {
        fields[field.name] = nowIso;
      } else {
        fields[field.name] = normalizeWriteValue(field, null);
      }
    }
    const writes: Record<string, FieldWrite> = {};
    const clocks: Record<string, string> = {};
    // 一次写一个时间戳：同一操作的各字段同时发生，逐字段发号只是空耗计数
    const hlc = this.stamp();
    for (const field of def.fields) {
      writes[field.name] = { value: fields[field.name], hlc };
      clocks[field.name] = hlc;
    }
    await this.tx(async () => {
      await this.writeRow(entity, id, fields, clocks, { insert: true });
      await this.appendOutbox(entity, id, writes);
    });
    this.notifyChanged({ origin: 'local', entities: [entity], ids: { [entity]: [id] } });
    return id;
  }

  /**
   * 更新实体字段：每个字段打上新的 HLC 时间戳，落库并进 Outbox。
   * updatedAt 自动推进（除非补丁显式给出）。
   */
  async update(entity: SyncEntity, id: string, patch: WireRow): Promise<void> {
    return this.updateMany(entity, [{ id, patch }]);
  }

  /**
   * 批量更新：一个事务、一次变更通知。重排等多行写入不再逐行触发 UI
   * 失效与重查（逐行时 UI 会渲染出只改了一半的中间顺序）。
   */
  async updateMany(
    entity: SyncEntity,
    patches: Array<{ id: string; patch: WireRow }>,
  ): Promise<void> {
    if (patches.length === 0) return;
    return this.serialized(async () => {
      await this.tx(async () => {
        for (const { id, patch } of patches) {
          await this.applyLocalUpdate(entity, id, patch);
        }
      });
      this.notifyChanged({
        origin: 'local',
        entities: [entity],
        ids: { [entity]: patches.map(({ id }) => id) },
      });
    });
  }

  /** 单行本地更新（调用方负责事务与通知）。 */
  private async applyLocalUpdate(entity: SyncEntity, id: string, patch: WireRow): Promise<void> {
    const def = entityDef(entity);
    const current = await this.getRaw(entity, id);
    if (!current) {
      throw new Error(`update: ${entity} ${id} 不存在`);
    }
    const effective = { ...patch };
    if (effective.updatedAt === undefined) {
      effective.updatedAt = new Date().toISOString();
    }
    const writes: Record<string, FieldWrite> = {};
    const clocks: Record<string, string> = { ...current.clocks };
    const fields: WireRow = { ...current.fields };
    const hlc = this.stamp();
    for (const field of def.fields) {
      const value = effective[field.name];
      if (value === undefined) continue;
      fields[field.name] = normalizeWriteValue(field, value);
      clocks[field.name] = hlc;
      writes[field.name] = { value: fields[field.name], hlc };
    }
    await this.writeRow(entity, id, fields, clocks, { insert: false });
    await this.appendOutbox(entity, id, writes);
  }

  /**
   * 设备发起的物理删除（Delete Request，ADR-0008）：立即从副本移除
   * （UI 即时可见），并把删除请求排进 Outbox 待 flush 推给 hub。hub
   * 处理后广播 Compact Event，其他设备同步移除。级联（Task → Subtask）
   * 与引用清理（SetNull 语义）与 hub 侧同规则。
   */
  async requestDelete(entity: SyncEntity, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    return this.serialized(() => this.requestDeleteInternal(entity, ids));
  }

  /**
   * 该 id 是否已被 compact（本地删除、远端 Compact Event 或 bootstrap
   * 登记过的）。Repeat 派生用它判断确定性 id 是否已「死」——已 compact
   * 的 id 无法经 hub 复活（ADR-0008：复活必须换新 id），派生需回退到
   * 新生成的 id（ADR-0012 的重派生路径）。
   */
  isCompacted(entity: SyncEntity, id: string): boolean {
    return this.compacted.has(`${entity}:${id}`);
  }

  private async requestDeleteInternal(entity: SyncEntity, ids: string[]): Promise<void> {
    const affected = new Set<SyncEntity>([entity]);
    await this.tx(async () => {
      await this.removeRows(entity, ids, { enqueue: true }, affected);
    });
    this.notifyChanged(removalChange('local', entity, ids, affected));
  }

  /**
   * 从副本移除一批实体行：级联子实体、清理引用（SetNull 语义）、
   * 从引用实体的 tagIds 数组剔除被删 tag、登记 compact（丢弃迟到远端
   * 写）。enqueue 时为每个 id 排一条 Delete Request 进 Outbox。
   *
   * affected 收集本次被波及的全部实体（含级联子实体与被清理引用的
   * 宿主实体），供上层按实体粒度失效 UI 缓存（M2：Area 被删时其下
   * Task/Project 的 areaId 清理必须失效 tasks/projects 查询）。
   */
  private async removeRows(
    entity: SyncEntity,
    ids: string[],
    opts: { enqueue: boolean; purgeOutbox?: boolean },
    affected: Set<SyncEntity>,
  ): Promise<number> {
    const def = entityDef(entity);
    for (const id of ids) {
      await this.registerCompacted(entity, id);
    }
    let removed = 0;
    // 级联（对齐 hub 侧 onDelete: Cascade）：Task → Subtask、
    // Project → ProjectHeading
    for (const cascade of DELETE_CASCADES[entity] ?? []) {
      const childDef = entityDef(cascade.entity);
      const placeholders = ids.map(() => '?').join(', ');
      const childRows = await this.storage.all<{ id: string }>(
        `SELECT id FROM ${childDef.table} WHERE ${cascade.foreignKey} IN (${placeholders})`,
        ids,
      );
      const childIds = childRows.map((row) => row.id);
      if (childIds.length > 0) {
        affected.add(cascade.entity);
        removed += await this.removeRows(cascade.entity, childIds, opts, affected);
      }
    }
    // 引用清理（对齐 hub 侧 onDelete: SetNull）：仅本地副本清理，不携
    // 带新时钟，不进 Outbox——真实字段写的 LWW 裁决不受影响。
    for (const ref of COMPACT_NULL_REFS[entity] ?? []) {
      const refDef = entityDef(ref.entity);
      const placeholders = ids.map(() => '?').join(', ');
      const { changes } = await this.storage.run(
        `UPDATE ${refDef.table} SET ${ref.field} = NULL WHERE ${ref.field} IN (${placeholders})`,
        ids,
      );
      if (changes > 0) affected.add(ref.entity);
    }
    // TagIds 数组清理：hub 侧 TagTag/ProjectTag/AreaTag 关系行随 tag
    // 删除级联消失，wire 读回已不含它；副本侧同步从 JSON 数组剔除，
    // 不携时钟不进 Outbox（与 SetNull 清理同一惯例）。
    if (entity === 'tag') {
      for (const refEntity of ['task', 'project', 'area'] as SyncEntity[]) {
        const refDef = entityDef(refEntity);
        for (const id of ids) {
          const rows = await this.storage.all<{ id: string; tagIds: string | null }>(
            `SELECT id, tagIds FROM ${refDef.table} WHERE tagIds LIKE ?`,
            [`%"${id}"%`],
          );
          for (const row of rows) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(row.tagIds ?? '[]');
            } catch {
              continue;
            }
            if (!Array.isArray(parsed) || !parsed.includes(id)) continue;
            const next = parsed.filter((value) => value !== id);
            await this.storage.run(`UPDATE ${refDef.table} SET tagIds = ? WHERE id = ?`, [
              JSON.stringify(next),
              row.id,
            ]);
            affected.add(refEntity);
          }
        }
      }
    }
    for (const id of ids) {
      if (opts.purgeOutbox) {
        // hub 已 compact 的实体：待推送的写与删除 hub 只会丢弃，撤掉它们，
        // 不必等 hub 的登记（登记会过期，issue 08）来拦截。
        await this.storage.run('DELETE FROM _outbox WHERE entity = ? AND entity_id = ?', [
          entity,
          id,
        ]);
      }
      const { changes } = await this.storage.run(`DELETE FROM ${def.table} WHERE id = ?`, [id]);
      removed += changes;
      if (changes === 0) continue; // 幂等：已不存在则无需排队
      if (opts.enqueue) {
        await this.appendDeleteOutbox(entity, id);
      }
    }
    return removed;
  }

  // ---------- 远端写（pull / bootstrap 应用） ----------

  /**
   * 应用一个远端实体变更（字段级 LWW）。返回是否产生了本地变更。
   * 自身回声（时间戳相同）幂等无操作。
   */
  async applyRemoteEntity(
    entity: SyncEntity,
    id: string,
    remote: EntityMergeState,
  ): Promise<boolean> {
    return this.serialized(() => this.applyRemoteEntityInternal(entity, id, remote));
  }

  private async applyRemoteEntityInternal(
    entity: SyncEntity,
    id: string,
    remote: EntityMergeState,
  ): Promise<boolean> {
    const applied = (await this.tx(() => this.mergeRemote(entity, id, remote))) !== null;
    if (applied) {
      this.notifyChanged({ origin: 'remote', entities: [entity], ids: { [entity]: [id] } });
    }
    return applied;
  }

  /**
   * 单个远端实体的 LWW 合并落库（调用方负责事务与通知）。返回 inserted
   * （本地原本没有这行）、updated，或 null（无变化）。
   */
  private async mergeRemote(
    entity: SyncEntity,
    id: string,
    remote: EntityMergeState,
  ): Promise<'inserted' | 'updated' | null> {
    this.absorbRemoteClocks(remote.clocks);
    // Compact 永久获胜（ADR-0008）：已 compact 的实体，迟到的远端字段
    // 变更一律静默丢弃（副本与 hub 同规则），不会「删了又复活」。
    if (this.compacted.has(`${entity}:${id}`)) return null;
    const current = await this.getRaw(entity, id);
    const outcome = mergeEntityState(current, remote);
    if (outcome.appliedFields.length === 0) return null;
    await this.writeRow(entity, id, outcome.fields, outcome.clocks, {
      insert: current === null,
    });
    return current === null ? 'inserted' : 'updated';
  }

  /** 应用 Compact Event：从副本物理移除一批实体。 */
  async applyCompact(entity: SyncEntity, ids: string[]): Promise<boolean> {
    return this.serialized(async () => {
      const affected = new Set<SyncEntity>();
      await this.tx(() => this.compactRows(entity, ids, affected));
      if (affected.size === 0) return false;
      this.notifyChanged(removalChange('remote', entity, ids, affected));
      return true;
    });
  }

  /**
   * 移除一批被 compact 的实体（调用方负责事务与通知）。affected 收集
   * 真正有变化的实体：行被删，或引用清理（SetNull/tagIds 剔除）波及他实体。
   */
  private async compactRows(
    entity: SyncEntity,
    ids: string[],
    affected: Set<SyncEntity>,
  ): Promise<void> {
    const touched = new Set<SyncEntity>([entity]);
    // 级联与引用清理与设备发起删除同规则（Task → Subtask；SetNull）；
    // 登记无论本地是否有行——compact 是 hub 的事实。
    const removed = await this.removeRows(
      entity,
      ids,
      { enqueue: false, purgeOutbox: true },
      touched,
    );
    if (removed > 0 || touched.size > 1) {
      for (const item of touched) affected.add(item);
    }
  }

  /**
   * 应用一次 pull 的全部远端变更并推进 Sync Cursor：一个事务、一次通知。
   * 逐条应用时每条都触发 UI 失效与整表重查，500 条变更就是 500 轮；
   * 游标与变更同事务提交，中途崩溃不会出现「游标已前进、变更没落库」。
   *
   * archiveCutoff（issue 08）：归档任务被远端修改后随日志回到副本，但它的
   * Subtask 没有变更、不会跟着回来。回到副本的任务（本地原本没有、创建
   * 早于截止时刻）与父任务不在副本里的 Subtask 登记为待补齐，与游标同
   * 事务提交；Engine 之后向 hub 取回它们（pendingBackfill）。
   */
  async applyRemoteBatch(
    changes: HubChange[],
    cursor: number,
    options: { archiveCutoff?: string } = {},
  ): Promise<void> {
    return this.serialized(async () => {
      const affected = new ChangedRows();
      await this.tx(async () => {
        const revived = new Set<string>();
        const subtaskParents = new Set<string>();
        for (const change of changes) {
          // 更新版本 hub 下发的、本端没有表的实体类型：跳过（协议规则见
          // ADR-0007「协议版本」——必须理解的新实体由 hub 提高最低版本）。
          if (!isSyncEntity(change.entity)) continue;
          if (change.kind === 'entity') {
            const applied = await this.mergeRemote(change.entity, change.id, {
              fields: change.fields,
              clocks: change.clocks,
            });
            if (applied) affected.rows(change.entity, [change.id]);
            if (applied === 'inserted' && options.archiveCutoff) {
              const { createdAt, taskId } = change.fields;
              if (
                change.entity === 'task' &&
                typeof createdAt === 'string' &&
                createdAt < options.archiveCutoff
              ) {
                revived.add(change.id);
              }
              if (change.entity === 'subtask' && typeof taskId === 'string') {
                subtaskParents.add(taskId);
              }
            }
          } else {
            const touched = new Set<SyncEntity>();
            await this.compactRows(change.entity, change.ids, touched);
            for (const entity of touched) {
              if (entity === change.entity) affected.rows(entity, change.ids);
              else affected.whole(entity);
            }
          }
        }
        if (subtaskParents.size > 0) {
          const parents = [...subtaskParents];
          const present = await this.storage.all<{ id: string }>(
            `SELECT id FROM task WHERE id IN (${parents.map(() => '?').join(', ')})`,
            parents,
          );
          const presentIds = new Set(present.map((row) => row.id));
          for (const id of parents) if (!presentIds.has(id)) revived.add(id);
        }
        if (revived.size > 0) {
          const pending = new Set(await this.pendingBackfillRaw());
          for (const id of revived) pending.add(id);
          await this.metaSet(BACKFILL_META_KEY, JSON.stringify([...pending]));
        }
        await this.metaSet('syncCursor', String(cursor));
      });
      if (affected.entities.size > 0) {
        this.notifyChanged(affected.toChange('remote'));
      }
    });
  }

  /** 待补齐 Subtask 的任务 id（见 applyRemoteBatch）。 */
  async pendingBackfill(): Promise<string[]> {
    await this.readGate();
    return this.pendingBackfillRaw();
  }

  private async pendingBackfillRaw(): Promise<string[]> {
    const raw = await this.metaGet(BACKFILL_META_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  }

  /**
   * 合并 hub 取回的实体（完整字段 + 完整时钟，LWW 与 pull 相同），并把
   * done 里的任务移出待补齐名单。一个事务、一次通知。
   */
  async applyRemoteEntries(entries: SnapshotEntry[], done: string[] = []): Promise<void> {
    return this.serialized(async () => {
      const affected = new ChangedRows();
      await this.tx(async () => {
        for (const entry of entries) {
          if (!isSyncEntity(entry.entity)) continue;
          if (await this.mergeRemote(entry.entity, entry.id, entry)) {
            affected.rows(entry.entity, [entry.id]);
          }
        }
        if (done.length > 0) {
          const finished = new Set(done);
          const remaining = (await this.pendingBackfillRaw()).filter((id) => !finished.has(id));
          await this.metaSet(BACKFILL_META_KEY, JSON.stringify(remaining));
        }
      });
      if (affected.entities.size > 0) this.notifyChanged(affected.toChange('remote'));
    });
  }

  // ---------- 快照重建（bootstrap，issue 08 分页） ----------

  /**
   * 开始一次快照重建，建好暂存表。
   *
   * 新设备（从未同步、副本里没有任何行）：各页直接合并进副本，第一页
   * 到达即可渲染——没有旧数据，谈不上「半份」。已有数据的副本：各页先写
   * 暂存表，全部到齐后由 finishBootstrap 在一个事务里整体替换，重建期间
   * 读者只看到旧副本或新副本。
   */
  async beginBootstrap(): Promise<void> {
    return this.serialized(async () => {
      const live = await this.isPristine();
      await this.tx(async () => {
        await this.dropStageTables();
        for (const entity of SYNC_ENTITIES) {
          await this.storage.exec(entityTableDdl(entity, stageTable(entity)));
        }
        await this.storage.exec(
          `CREATE TABLE IF NOT EXISTS _stage_compacted (
            entity TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            PRIMARY KEY (entity, entity_id)
          )`,
        );
      });
      this.bootstrapLive = live;
    });
  }

  /** 写入快照的一页（及 hub 的 Compact 登记）。 */
  async stageSnapshot(snapshot: SnapshotEntry[], compacted: DeleteRequest[] = []): Promise<void> {
    return this.serialized(async () => {
      const affected = new ChangedRows();
      await this.tx(async () => {
        for (const request of compacted) {
          // 本端不认识的实体类型（更新版本 hub）跳过，理由同 applyRemoteBatch。
          if (!isSyncEntity(request.entity)) continue;
          for (const id of request.ids) {
            await this.storage.run(
              'INSERT OR IGNORE INTO _stage_compacted (entity, entity_id) VALUES (?, ?)',
              [request.entity, id],
            );
          }
        }
        for (const entry of snapshot) {
          if (!isSyncEntity(entry.entity)) continue;
          if (this.bootstrapLive) {
            // 与本地写并发：按 LWW 合并，不覆盖用户刚做的编辑
            if (await this.mergeRemote(entry.entity, entry.id, entry)) {
              affected.rows(entry.entity, [entry.id]);
            }
          } else {
            await this.writeRow(entry.entity, entry.id, entry.fields, entry.clocks, {
              insert: true,
              table: stageTable(entry.entity),
            });
            this.absorbRemoteClocks(entry.clocks);
          }
        }
      });
      if (affected.entities.size > 0) this.notifyChanged(affected.toChange('remote'));
    });
  }

  /**
   * 快照到齐：在一个事务里换上新副本、登记 hub 的 Compact 登记、回放
   * Outbox、推进 Sync Cursor（中途崩溃时游标不动，下次重新 bootstrap）。
   *
   * Outbox 保留——未同步的本地写之后照常 flush 推给 hub，时间戳新者胜，
   * 最终收敛。重建后立即把 Outbox 中的写重新落回本地，未同步编辑不会
   * 从 UI 上消失。
   */
  async finishBootstrap(cursor: number): Promise<void> {
    return this.serialized(async () => {
      const now = this.now();
      await this.tx(async () => {
        if (!this.bootstrapLive) {
          // 登记以 hub 的持久登记为准整体替换（未同步的本地删除在 Outbox
          // 回放时重新登记）。
          await this.storage.exec('DELETE FROM _compacted');
        }
        for (const entity of SYNC_ENTITIES) {
          const def = entityDef(entity);
          // 快照里仍有的行以快照为准：Compact 登记可能先于一个最终回滚的
          // 删除；真正并发删除的 Compact Event 会在 cursor fence 后重放。
          const source = this.bootstrapLive ? def.table : stageTable(entity);
          await this.storage.run(
            `INSERT OR IGNORE INTO _compacted (entity, entity_id, registered_at)
             SELECT entity, entity_id, ? FROM _stage_compacted
             WHERE entity = ? AND entity_id NOT IN (SELECT id FROM ${source})`,
            [now, entity],
          );
          if (this.bootstrapLive) continue;
          const columns = ['id', ...def.fields.map((field) => field.name), 'clocks'].join(', ');
          await this.storage.exec(`DELETE FROM ${def.table}`);
          await this.storage.exec(
            `INSERT INTO ${def.table} (${columns}) SELECT ${columns} FROM ${stageTable(entity)}`,
          );
        }
        await this.reloadCompacted();
        // 新设备的各页已与本地写逐行合并，Outbox 不必回放
        if (!this.bootstrapLive) await this.replayOutbox();
        await this.metaSet('syncCursor', String(cursor));
        await this.dropStageTables();
      });
      this.bootstrapLive = false;
      this.notifyChanged({ origin: 'bootstrap' });
    });
  }

  /**
   * Outbox 回放（finishBootstrap 的事务内：读者不会看到「快照已换、本地
   * 编辑未回放」的中间态）：本地合并（不重新打时间戳，保留原 HLC）；
   * Delete Request 照常回放为本地删除（未同步的删除不因重建而丢失）。
   */
  private async replayOutbox(): Promise<void> {
    const pending = await this.takeOutbox(Number.MAX_SAFE_INTEGER);
    for (const entry of pending) {
      if (entry.kind === 'delete') {
        await this.removeRows(entry.entity, [entry.id], { enqueue: false }, new Set());
        continue;
      }
      const { event } = entry;
      if (this.compacted.has(`${event.entity}:${event.id}`)) continue;
      const current = await this.getRaw(event.entity, event.id);
      // 快照里没有这行、这条写也不是创建（创建总带 createdAt）：行在 hub
      // 上已不存在，或是没进快照的归档任务。只写这几个字段会在副本里
      // 留下残缺行；留在 Outbox 里推给 hub，由 hub 的合并结果（或 Compact
      // Event）决定它的去向。
      if (current === null && !('createdAt' in event.fields)) continue;
      const remote: EntityMergeState = {
        fields: Object.fromEntries(
          Object.entries(event.fields).map(([field, write]) => [field, write.value]),
        ),
        clocks: Object.fromEntries(
          Object.entries(event.fields).map(([field, write]) => [field, write.hlc]),
        ),
      };
      const outcome = mergeEntityState(current, remote);
      await this.writeRow(event.entity, event.id, outcome.fields, outcome.clocks, {
        insert: current === null,
      });
    }
  }

  private async dropStageTables(): Promise<void> {
    for (const entity of SYNC_ENTITIES) {
      await this.storage.exec(`DROP TABLE IF EXISTS ${stageTable(entity)}`);
    }
    await this.storage.exec('DROP TABLE IF EXISTS _stage_compacted');
  }

  /** 从未同步、没有任何实体行的副本（新设备）。 */
  private async isPristine(): Promise<boolean> {
    if ((await this.getCursor()) !== 0) return false;
    for (const entity of SYNC_ENTITIES) {
      const rows = await this.storage.all(
        `SELECT 1 AS present FROM ${entityDef(entity).table} LIMIT 1`,
      );
      if (rows.length > 0) return false;
    }
    return true;
  }

  // ---------- 数据增长（issue 08） ----------

  /**
   * 裁掉归档任务（规则见 archive.ts 的 isArchivedTask，这里是同一规则的
   * SQL）及其 Subtask：只删本地行，不登记 compact、不进 Outbox——hub 上
   * 它们照常存在，Logbook 按页从 hub 读取。任务或其 Subtask 仍有待推送
   * 的写时留下（回放与推送需要本地行）。返回裁掉的任务数。
   */
  async pruneArchive(cutoff: string): Promise<number> {
    const settled = SETTLED_TASK_STATUSES.map(() => '?').join(', ');
    const affected = new ChangedRows();
    let total = 0;
    for (;;) {
      const pruned = await this.serialized(() =>
        this.tx(async () => {
          const tasks = await this.storage.all<{ id: string }>(
            `SELECT id FROM task
             WHERE status IN (${settled}) AND settledAt < ? AND trashedAt IS NULL
               AND (projectId IS NULL OR projectId IN (SELECT id FROM project WHERE status = ?))
               AND id NOT IN (SELECT entity_id FROM _outbox WHERE entity = 'task')
               AND id NOT IN (
                 SELECT taskId FROM subtask WHERE taskId IS NOT NULL
                   AND id IN (SELECT entity_id FROM _outbox WHERE entity = 'subtask')
               )
             LIMIT ?`,
            [...SETTLED_TASK_STATUSES, cutoff, ProjectStatus.COMPLETED, PRUNE_CHUNK],
          );
          const taskIds = tasks.map((row) => row.id);
          if (taskIds.length === 0) return { taskIds, subtaskIds: [] as string[] };
          const placeholders = taskIds.map(() => '?').join(', ');
          const subtasks = await this.storage.all<{ id: string }>(
            `SELECT id FROM subtask WHERE taskId IN (${placeholders})`,
            taskIds,
          );
          await this.storage.run(`DELETE FROM subtask WHERE taskId IN (${placeholders})`, taskIds);
          await this.storage.run(`DELETE FROM task WHERE id IN (${placeholders})`, taskIds);
          return { taskIds, subtaskIds: subtasks.map((row) => row.id) };
        }),
      );
      if (pruned.taskIds.length > 0) affected.rows('task', pruned.taskIds);
      if (pruned.subtaskIds.length > 0) affected.rows('subtask', pruned.subtaskIds);
      total += pruned.taskIds.length;
      if (pruned.taskIds.length < PRUNE_CHUNK) break;
    }
    if (affected.entities.size > 0) this.notifyChanged(affected.toChange('remote'));
    return total;
  }

  /**
   * 删除本机登记早于 beforeMs 的 Compact 登记（保留期见
   * COMPACT_REGISTRY_RETENTION_DAYS）。登记不影响任何可见数据，不发通知。
   */
  async expireCompacted(beforeMs: number): Promise<number> {
    return this.serialized(async () => {
      const { changes } = await this.tx(() =>
        this.storage.run('DELETE FROM _compacted WHERE registered_at < ?', [beforeMs]),
      );
      if (changes > 0) await this.reloadCompacted();
      return changes;
    });
  }

  // ---------- Outbox ----------

  /**
   * 取待推送的条目（按入队顺序）：普通字段写与 Delete Request。
   * excludeRowIds：跳过的条目（flush 本轮被 hub 拒绝、留在 Outbox 里的）。
   */
  async takeOutbox(limit = 500, excludeRowIds: readonly number[] = []): Promise<OutboxEntry[]> {
    const exclude =
      excludeRowIds.length > 0
        ? `WHERE id NOT IN (${excludeRowIds.map(() => '?').join(', ')}) `
        : '';
    const rows = await this.storage.all<{
      id: number;
      revision: number;
      kind: string;
      entity: string;
      entity_id: string;
      fields: string;
    }>(
      `SELECT id, revision, kind, entity, entity_id, fields FROM _outbox ${exclude}ORDER BY id ASC LIMIT ?`,
      [...excludeRowIds, limit],
    );
    return rows.map((row) => {
      if (row.kind === 'delete') {
        return {
          rowId: row.id,
          revision: row.revision,
          kind: 'delete' as const,
          entity: row.entity as SyncEntity,
          id: row.entity_id,
        };
      }
      return {
        rowId: row.id,
        revision: row.revision,
        kind: 'write' as const,
        event: {
          entity: row.entity as SyncEntity,
          id: row.entity_id,
          fields: JSON.parse(row.fields) as Record<string, FieldWrite>,
        },
      };
    });
  }

  async outboxCount(): Promise<number> {
    const rows = await this.storage.all<{ count: number }>('SELECT COUNT(*) AS count FROM _outbox');
    return rows[0]?.count ?? 0;
  }

  /**
   * flush 成功后仅删除发送时的确切 revision。请求飞行期间若本地编辑把
   * 同一行推进了 revision，旧响应不得清掉新内容；flush 循环会再发送它。
   */
  async deleteOutbox(entries: Array<Pick<OutboxEntry, 'rowId' | 'revision'>>): Promise<void> {
    return this.serialized(() =>
      this.tx(async () => {
        for (const entry of entries) {
          await this.storage.run('DELETE FROM _outbox WHERE id = ? AND revision = ?', [
            entry.rowId,
            entry.revision,
          ]);
        }
      }),
    );
  }

  // ---------- 内部 ----------

  /** 登记一个已 compact 的 id（内存 + `_compacted` 表，调用方负责事务）。 */
  private async registerCompacted(entity: SyncEntity, id: string): Promise<void> {
    const key = `${entity}:${id}`;
    if (this.compacted.has(key)) return;
    await this.storage.run(
      'INSERT OR IGNORE INTO _compacted (entity, entity_id, registered_at) VALUES (?, ?, ?)',
      [entity, id, this.now()],
    );
    this.compacted.add(key);
  }

  /** 按 `_compacted` 表重建内存登记。 */
  private async reloadCompacted(): Promise<void> {
    const rows = await this.storage.all<{ entity: string; entity_id: string }>(
      'SELECT entity, entity_id FROM _compacted',
    );
    this.compacted.clear();
    for (const row of rows) this.compacted.add(`${row.entity}:${row.entity_id}`);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /**
   * 吸收远端时钟：拉取过远端变更的设备再发号时必然晚于已见过的最大
   * 远端时间戳（HLC 因果性），避免同墙钟设备被旧基线压掉。
   */
  private absorbRemoteClocks(clocks: Record<string, string>): void {
    let max: string | null = null;
    for (const stamp of Object.values(clocks)) {
      if (max === null || compareHlc(stamp, max) > 0) max = stamp;
    }
    if (max !== null) {
      this.clock.receive(max);
      this.clockDirty = true;
    }
  }

  private stamp(): string {
    this.clockDirty = true;
    return this.clock.now();
  }

  private async metaGet(key: string): Promise<string | null> {
    const rows = await this.storage.all<{ value: string }>(
      'SELECT value FROM _engine_meta WHERE key = ?',
      [key],
    );
    return rows[0]?.value ?? null;
  }

  private async metaSet(key: string, value: string): Promise<void> {
    await this.storage.run(
      'INSERT INTO _engine_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }

  private rowToState(entity: SyncEntity, row: Record<string, unknown>): EntityMergeState {
    const { id: _id, clocks, ...rest } = row;
    void _id;
    return {
      fields: this.decodeRow(entity, rest),
      clocks: JSON.parse((clocks as string) ?? '{}'),
    };
  }

  private decodeRow(entity: SyncEntity, row: Record<string, unknown>): WireRow {
    const def = entityDef(entity);
    const fields: WireRow = {};
    for (const field of def.fields) {
      const value = row[field.name];
      fields[field.name] = field.json && typeof value === 'string' ? JSON.parse(value) : value;
    }
    return fields;
  }

  private async writeRow(
    entity: SyncEntity,
    id: string,
    fields: WireRow,
    clocks: Record<string, string>,
    opts: { insert: boolean; table?: string },
  ): Promise<void> {
    const def = entityDef(entity);
    const table = opts.table ?? def.table;
    const columns: unknown[] = [];
    for (const field of def.fields) {
      const value = fields[field.name] ?? null;
      columns.push(field.json ? JSON.stringify(value ?? null) : value);
    }
    const allColumns = ['id', ...def.fields.map((field) => field.name), 'clocks'];
    const allValues: unknown[] = [id, ...columns, JSON.stringify(clocks)];
    if (opts.insert) {
      await this.storage.run(
        `INSERT OR REPLACE INTO ${table} (${allColumns.join(', ')}) VALUES (${allColumns
          .map(() => '?')
          .join(', ')})`,
        allValues,
      );
    } else {
      const assignments = allColumns.slice(1).map((column) => `${column} = ?`);
      await this.storage.run(`UPDATE ${table} SET ${assignments.join(', ')} WHERE id = ?`, [
        ...allValues.slice(1),
        id,
      ]);
    }
  }

  /**
   * 追加 Outbox。仅当队尾正是同实体同 id 的字段写时就地合并（连续编辑
   * 同一行，如打字），否则追加新行。
   *
   * 不能合并进更早的行：那会把新写（可能引用此后才创建的实体）挪到被
   * 引用实体的创建之前。flush 按 500 条分批，若被引用实体落在后一批，
   * 前一批在 hub 侧永远 FK 失败，后一批永远发不出去——同步永久卡死。
   * 只合并队尾保证 Outbox 始终是因果序，任意前缀分批都可独立提交。
   */
  private async appendOutbox(
    entity: SyncEntity,
    id: string,
    writes: Record<string, FieldWrite>,
  ): Promise<void> {
    if (Object.keys(writes).length === 0) return;
    const rows = await this.storage.all<{
      id: number;
      kind: string;
      entity: string;
      entity_id: string;
      fields: string;
    }>('SELECT id, kind, entity, entity_id, fields FROM _outbox ORDER BY id DESC LIMIT 1');
    const tail = rows[0];
    const existing =
      tail && tail.kind === 'write' && tail.entity === entity && tail.entity_id === id
        ? tail
        : undefined;
    if (existing) {
      const merged = {
        ...(JSON.parse(existing.fields) as Record<string, FieldWrite>),
        ...writes,
      };
      await this.storage.run(
        'UPDATE _outbox SET fields = ?, revision = revision + 1 WHERE id = ?',
        [JSON.stringify(merged), existing.id],
      );
      return;
    }
    await this.storage.run(
      "INSERT INTO _outbox (kind, entity, entity_id, fields) VALUES ('write', ?, ?, ?)",
      [entity, id, JSON.stringify(writes)],
    );
  }

  /**
   * 排入 Delete Request（ADR-0008）。重复删除同 id 幂等：已有 pending
   * delete 则不再追加；已有的 pending 字段写保留（flush 时 hub 先合并
   * 字段写、再应用删除，顺序不乱）。
   */
  private async appendDeleteOutbox(entity: SyncEntity, id: string): Promise<void> {
    const rows = await this.storage.all<{ id: number }>(
      "SELECT id FROM _outbox WHERE entity = ? AND entity_id = ? AND kind = 'delete'",
      [entity, id],
    );
    if (rows.length > 0) return;
    await this.storage.run(
      "INSERT INTO _outbox (kind, entity, entity_id, fields) VALUES ('delete', ?, ?, '{}')",
      [entity, id],
    );
  }
}

/** 删除类变更：被删实体的行已知，级联 / 引用清理波及的其他实体行未知。 */
function removalChange(
  origin: 'local' | 'remote',
  entity: SyncEntity,
  ids: string[],
  affected: Set<SyncEntity>,
): EngineChange {
  const rows = new ChangedRows();
  for (const item of affected) {
    if (item === entity) rows.rows(item, ids);
    else rows.whole(item);
  }
  return rows.toChange(origin);
}
