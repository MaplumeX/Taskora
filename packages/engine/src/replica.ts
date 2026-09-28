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
 * - 快照重建（bootstrap）：整表替换、保留未同步 Outbox；
 * - 变更通知：任何本地/应用远端写都推进版本号、通知订阅者。
 *
 * 存储接口为异步（Tauri IPC 场景），方法均返回 Promise。
 */

import {
  COMPACT_NULL_REFS,
  DELETE_CASCADES,
  entityDef,
  schemaDdl,
  SYNC_ENTITIES,
  type FieldDef,
  type SyncEntity,
  type WireRow,
} from './entities';
import { HybridClock } from './hlc';
import { mergeEntityState, type EntityMergeState, type FieldWrite } from './merger';
import type { HubChange, OutboxEvent, SnapshotEntry } from './protocol';
import { inTransaction, type SqlStorage } from './storage';

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
  | string
  | number
  | null
  | { notNull: true }
  | { in: Array<string | number> };
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
 */
export interface EngineChange {
  origin: 'local' | 'remote' | 'bootstrap';
  entities?: SyncEntity[];
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
    for (const statement of schemaDdl()) {
      await this.storage.exec(statement);
    }
    // V1 → V2 迁移：_outbox 增加 kind 列（Delete Request 排队，ADR-0008）。
    // 新库由 DDL 直接带列；旧库（V1 桌面安装）按需 ALTER。
    const columns = await this.storage.all<{ name: string }>(
      "SELECT name FROM pragma_table_info('_outbox')",
    );
    if (columns.length > 0 && !columns.some((column) => column.name === 'kind')) {
      await this.storage.exec("ALTER TABLE _outbox ADD COLUMN kind TEXT NOT NULL DEFAULT 'write'");
    }
    if (columns.length > 0 && !columns.some((column) => column.name === 'revision')) {
      await this.storage.exec('ALTER TABLE _outbox ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
    }
    // Reminders feature（reminders spec）：task 增加 reminderTime 列。
    // 新库由 DDL 直接带列；旧库（无该列的桌面/移动安装）按需 ALTER。
    const taskColumns = await this.storage.all<{ name: string }>(
      "SELECT name FROM pragma_table_info('task')",
    );
    if (taskColumns.length > 0 && !taskColumns.some((column) => column.name === 'reminderTime')) {
      await this.storage.exec('ALTER TABLE task ADD COLUMN reminderTime TEXT');
    }
    // Recurring tasks feature（recurring-tasks spec）：task 增加 repeatRule 列
    // （JSON 文本：规范形规则对象）。新库由 DDL 直接带列；旧库按需 ALTER。
    if (taskColumns.length > 0 && !taskColumns.some((column) => column.name === 'repeatRule')) {
      await this.storage.exec('ALTER TABLE task ADD COLUMN repeatRule TEXT');
    }
    await this.metaSet('deviceId', this.options.deviceId);
    const compactedRows = await this.storage.all<{ entity: string; entity_id: string }>(
      'SELECT entity, entity_id FROM _compacted',
    );
    for (const row of compactedRows) {
      this.compacted.add(`${row.entity}:${row.entity_id}`);
    }
    const saved = await this.metaGet('hlc');
    if (saved) {
      const state = JSON.parse(saved) as { wallMs: number; counter: number };
      this.clock.restoreState(state);
    }
  }

  get deviceId(): string {
    return this.options.deviceId;
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
    const limit = options.limit !== undefined ? `LIMIT ${Math.max(0, Math.floor(options.limit))}` : '';
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
    this.notifyChanged({ origin: 'local', entities: [entity] });
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
  async updateMany(entity: SyncEntity, patches: Array<{ id: string; patch: WireRow }>): Promise<void> {
    if (patches.length === 0) return;
    return this.serialized(async () => {
      await this.tx(async () => {
        for (const { id, patch } of patches) {
          await this.applyLocalUpdate(entity, id, patch);
        }
      });
      this.notifyChanged({ origin: 'local', entities: [entity] });
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
    this.notifyChanged({ origin: 'local', entities: [...affected] });
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
    opts: { enqueue: boolean },
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
    const applied = await this.tx(() => this.mergeRemote(entity, id, remote));
    if (applied) this.notifyChanged({ origin: 'remote', entities: [entity] });
    return applied;
  }

  /** 单个远端实体的 LWW 合并落库（调用方负责事务与通知）。 */
  private async mergeRemote(
    entity: SyncEntity,
    id: string,
    remote: EntityMergeState,
  ): Promise<boolean> {
    this.absorbRemoteClocks(remote.clocks);
    // Compact 永久获胜（ADR-0008）：已 compact 的实体，迟到的远端字段
    // 变更一律静默丢弃（副本与 hub 同规则），不会「删了又复活」。
    if (this.compacted.has(`${entity}:${id}`)) return false;
    const current = await this.getRaw(entity, id);
    const outcome = mergeEntityState(current, remote);
    if (outcome.appliedFields.length === 0) return false;
    await this.writeRow(entity, id, outcome.fields, outcome.clocks, {
      insert: current === null,
    });
    return true;
  }

  /** 应用 Compact Event：从副本物理移除一批实体。 */
  async applyCompact(entity: SyncEntity, ids: string[]): Promise<boolean> {
    return this.serialized(async () => {
      const affected = new Set<SyncEntity>();
      await this.tx(() => this.compactRows(entity, ids, affected));
      if (affected.size === 0) return false;
      this.notifyChanged({ origin: 'remote', entities: [...affected] });
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
    const removed = await this.removeRows(entity, ids, { enqueue: false }, touched);
    if (removed > 0 || touched.size > 1) {
      for (const item of touched) affected.add(item);
    }
  }

  /**
   * 应用一次 pull 的全部远端变更并推进 Sync Cursor：一个事务、一次通知。
   * 逐条应用时每条都触发 UI 失效与整表重查，500 条变更就是 500 轮；
   * 游标与变更同事务提交，中途崩溃不会出现「游标已前进、变更没落库」。
   */
  async applyRemoteBatch(changes: HubChange[], cursor: number): Promise<void> {
    return this.serialized(async () => {
      const affected = new Set<SyncEntity>();
      await this.tx(async () => {
        for (const change of changes) {
          if (change.kind === 'entity') {
            const applied = await this.mergeRemote(change.entity, change.id, {
              fields: change.fields,
              clocks: change.clocks,
            });
            if (applied) affected.add(change.entity);
          } else {
            await this.compactRows(change.entity, change.ids, affected);
          }
        }
        await this.metaSet('syncCursor', String(cursor));
      });
      if (affected.size > 0) {
        this.notifyChanged({ origin: 'remote', entities: [...affected] });
      }
    });
  }

  /**
   * 快照重建：整表替换为 hub 的合并态。Outbox 保留——未同步的本地写
   * 之后照常 flush 推给 hub，时间戳新者胜，最终收敛。重建后立即把
   * Outbox 中的写重新落回本地，未同步编辑不会从 UI 上消失。
   */
  async replaceAll(
    snapshot: SnapshotEntry[],
    compacted: Array<{ entity: SyncEntity; ids: string[] }> = [],
  ): Promise<void> {
    return this.serialized(() => this.replaceAllInternal(snapshot, compacted));
  }

  private async replaceAllInternal(
    snapshot: SnapshotEntry[],
    compacted: Array<{ entity: SyncEntity; ids: string[] }>,
  ): Promise<void> {
    const snapshotKeys = new Set(snapshot.map((entry) => `${entry.entity}:${entry.id}`));
    this.compacted.clear();
    await this.tx(async () => {
      // 登记以 hub 的持久登记为准整体替换（未同步的本地删除在下方
      // Outbox 回放时重新登记）。
      await this.storage.exec('DELETE FROM _compacted');
      for (const request of compacted) {
        for (const id of request.ids) {
          // Compact intent 可能先于一个最终回滚的删除登记；快照仍有行时以
          // 快照为准。真正并发删除的 Compact Event 会在 cursor fence 后重放。
          if (!snapshotKeys.has(`${request.entity}:${id}`)) {
            await this.registerCompacted(request.entity, id);
          }
        }
      }
      for (const entity of SYNC_ENTITIES) {
        await this.storage.exec(`DELETE FROM ${entityDef(entity).table}`);
      }
      for (const entry of snapshot) {
        if (this.compacted.has(`${entry.entity}:${entry.id}`)) continue;
        await this.writeRow(entry.entity, entry.id, entry.fields, entry.clocks, {
          insert: true,
        });
        this.absorbRemoteClocks(entry.clocks);
      }
      // Outbox 回放（同一事务内：读者不会看到「快照已换、本地编辑未回放」
      // 的中间态）：本地合并（不重新打时间戳，保留原 HLC）；Delete
      // Request 照常回放为本地删除（未同步的删除不因重建而丢失）。
      const pending = await this.takeOutbox(Number.MAX_SAFE_INTEGER);
      for (const entry of pending) {
        if (entry.kind === 'delete') {
          await this.removeRows(entry.entity, [entry.id], { enqueue: false }, new Set());
          continue;
        }
        const { event } = entry;
        if (this.compacted.has(`${event.entity}:${event.id}`)) continue;
        const current = await this.getRaw(event.entity, event.id);
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
    });
    this.notifyChanged({ origin: 'bootstrap' });
  }

  // ---------- Outbox ----------

  /** 取待推送的条目（按入队顺序）：普通字段写与 Delete Request。 */
  async takeOutbox(limit = 500): Promise<OutboxEntry[]> {
    const rows = await this.storage.all<{
      id: number;
      revision: number;
      kind: string;
      entity: string;
      entity_id: string;
      fields: string;
    }>(
      'SELECT id, revision, kind, entity, entity_id, fields FROM _outbox ORDER BY id ASC LIMIT ?',
      [limit],
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
    await this.storage.run('INSERT OR IGNORE INTO _compacted (entity, entity_id) VALUES (?, ?)', [
      entity,
      id,
    ]);
    this.compacted.add(key);
  }

  /**
   * 吸收远端时钟：拉取过远端变更的设备再发号时必然晚于已见过的最大
   * 远端时间戳（HLC 因果性），避免同墙钟设备被旧基线压掉。
   */
  private absorbRemoteClocks(clocks: Record<string, string>): void {
    let max: string | null = null;
    for (const stamp of Object.values(clocks)) {
      if (max === null || stamp > max) max = stamp;
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
    opts: { insert: boolean },
  ): Promise<void> {
    const def = entityDef(entity);
    const columns: unknown[] = [];
    for (const field of def.fields) {
      const value = fields[field.name] ?? null;
      columns.push(field.json ? JSON.stringify(value ?? null) : value);
    }
    const allColumns = ['id', ...def.fields.map((field) => field.name), 'clocks'];
    const allValues: unknown[] = [id, ...columns, JSON.stringify(clocks)];
    if (opts.insert) {
      await this.storage.run(
        `INSERT OR REPLACE INTO ${def.table} (${allColumns.join(', ')}) VALUES (${allColumns
          .map(() => '?')
          .join(', ')})`,
        allValues,
      );
    } else {
      const assignments = allColumns.slice(1).map((column) => `${column} = ?`);
      await this.storage.run(`UPDATE ${def.table} SET ${assignments.join(', ')} WHERE id = ?`, [
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
